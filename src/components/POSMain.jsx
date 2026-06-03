import { useEffect, useRef, useState, useCallback } from 'react'
import { usePOSStore } from '../store/posStore'
import { getItemGroups, getItems, getOpenPOSSession, getWarehouseStock, getPromotionalSchemes } from '../services/api'
import { signOut } from '../services/auth'
import { cacheGet, cacheSet, cacheClear, cacheGetPersist, cacheSetPersist, cacheGetPersistStale, cacheClearPersist, getQueuedInvoices } from '../services/cache'
import ItemGrid from './ItemGrid'
import BillTable from './BillTable'
import AddItemBar from './AddItemBar'
import ItemDialog from './ItemDialog'
import PaymentModal from './PaymentModal'
import POSOpeningModal from './POSOpeningModal'
import SalesSummaryModal from './SalesSummaryModal'
import Settings from './Settings'
import OfflineQueueModal from './OfflineQueueModal'
import VirtualKeyboard from './VirtualKeyboard'
import ReturnTab from './ReturnTab'
import BillRecallModal from './BillRecallModal'

export default function POSMain() {
  const store = usePOSStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [queueCount, setQueueCount]     = useState(0)
  const [itemsHidden, setItemsHidden]   = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncError, setSyncError]       = useState('')
  const [queueModalOpen, setQueueModalOpen] = useState(false)
  const [posImage, setPosImage]         = useState(null)
  const [billRecallOpen, setBillRecallOpen] = useState(false)
  const wasOnline = useRef(store.isOnline)
  const now = new Date()

  // Load custom POS image; reload whenever Settings panel closes
  useEffect(() => {
    window.electronAPI?.storeGet('posImage').then((v) => setPosImage(v || null))
  }, [settingsOpen])

  // Keep only groups listed in the POS Profile item_groups child table.
  // Uses getState() so it always reads live Zustand state, not a stale closure.
  // Falls back to showing all groups if the profile has none configured.
  function filterByProfile(allGroups) {
    const profileData = usePOSStore.getState().posProfileData
    const rows = profileData?.item_groups   // ERPNext child table rows
    if (!rows || rows.length === 0) return allGroups
    // ERPNext uses field name "item_group" on each child row
    const allowedSet = new Set(rows.map((r) => r.item_group).filter(Boolean))
    if (allowedSet.size === 0) return allGroups
    return allGroups.filter((g) => allowedSet.has(g.name))
  }

  async function handleSync() {
    if (store.syncStatus === 'syncing') return
    store.setSyncStatus('syncing')
    setSyncProgress(0)
    setSyncError('')
    try {
      cacheClear()
      setSyncProgress(10)

      const warehouse = store.posProfileData?.warehouse

      // Fetch item groups, all items, warehouse stock, and promo schemes in parallel
      const [groups, allData, stockMap, promos] = await Promise.all([
        getItemGroups(),
        fetchAllItems(),
        warehouse ? getWarehouseStock(warehouse) : Promise.resolve({}),
        getPromotionalSchemes().catch(() => []),
      ])
      setSyncProgress(70)

      store.setItemGroups(filterByProfile(groups))
      store.setItems(allData)
      store.setPromoSchemes(promos)

      // Write all caches in parallel; also fetch the selected group if needed
      const cacheOps = [
        cacheSetPersist('itemGroups', groups),
        cacheSetPersist('items:All:', allData),
        cacheSetPersist('promoSchemes', promos),
      ]
      if (warehouse && stockMap) cacheOps.push(cacheSetPersist(`stock:${warehouse}`, stockMap))
      if (store.selectedGroup !== 'All') {
        cacheOps.push(
          fetchAllItems(store.selectedGroup)
            .then((gd) => cacheSetPersist(`items:${store.selectedGroup}:`, gd))
            .catch(() => {})
        )
      }
      await Promise.all(cacheOps)
      setSyncProgress(100)

      store.incrementSyncVersion()
      store.setSyncStatus('done')
      setTimeout(() => store.setSyncStatus('idle'), 2000)
    } catch (err) {
      const msg = err?.message || 'Network error'
      setSyncError(msg)
      store.setSyncStatus('error')
      setTimeout(() => store.setSyncStatus('idle'), 3000)
    }
  }

  // Fetches all items with pagination (500 per page)
  async function fetchAllItems(group = null) {
    const PAGE = 500
    const filters = group ? { itemGroup: group } : {}
    let all = []
    let offset = 0
    while (true) {
      const batch = await getItems(filters, PAGE, offset)
      all = all.concat(batch)
      if (batch.length < PAGE) break
      offset += PAGE
    }
    return all
  }

  // Poll offline queue count
  useEffect(() => {
    async function checkQueue() {
      const q = await getQueuedInvoices()
      setQueueCount(q.length)
    }
    checkQueue()
    const id = setInterval(checkQueue, 10000)
    return () => clearInterval(id)
  }, [])

  // Load item groups + pre-cache All items + promo schemes for offline use.
  // Re-runs when posProfileData changes so the filter is applied with the correct profile.
  useEffect(() => {
    if (!store.posProfileData) return   // wait until profile is loaded
    async function load() {
      // Serve from disk immediately if available
      const [cachedGroups, cachedPromos] = await Promise.all([
        cacheGetPersist('itemGroups'),
        cacheGetPersist('promoSchemes'),
      ])
      if (cachedGroups) store.setItemGroups(filterByProfile(cachedGroups))
      if (cachedPromos) store.setPromoSchemes(cachedPromos)

      // Refresh from network in background
      try {
        const [groups, promos] = await Promise.all([
          getItemGroups(),
          getPromotionalSchemes().catch(() => []),
        ])
        store.setItemGroups(filterByProfile(groups))
        store.setPromoSchemes(promos)
        await Promise.all([
          cacheSetPersist('itemGroups', groups),   // always cache unfiltered
          cacheSetPersist('promoSchemes', promos),
        ])

        // Pre-cache All items so offline search always has data
        const existingItems = await cacheGetPersist('items:All:')
        if (!existingItems) {
          const allItems = await getItems({}, 100)
          await cacheSetPersist('items:All:', allItems)
        }
      } catch { /* offline on startup — disk cache already served above */ }
    }
    load()
  }, [store.posProfileData])

  // Auto-sync queued invoices silently when connection is restored
  useEffect(() => {
    const justCameOnline = store.isOnline && !wasOnline.current
    wasOnline.current = store.isOnline
    if (!justCameOnline) return

    async function autoSync() {
      const queue = await getQueuedInvoices()
      if (queue.length === 0) return
      // Open the queue modal so cashier sees what's happening
      setQueueModalOpen(true)
    }
    autoSync()
  }, [store.isOnline])

  // Check for an existing open POS session; if none, prompt to open one
  useEffect(() => {
    if (!store.posProfile) return
    async function checkSession() {
      try {
        const session = await getOpenPOSSession(store.posProfile)
        if (session) {
          const cash = (session.balance_details || [])
            .find((b) => b.mode_of_payment?.toLowerCase().includes('cash'))
            ?.opening_amount || 0
          store.setPosOpeningEntry(session.name, cash, session.user, session.period_start_date)
          // Cache session so it can be restored when offline
          cacheSetPersist(`posSession:${store.posProfile}`, {
            name: session.name, cash, user: session.user,
            period_start_date: session.period_start_date,
          })
        } else {
          store.setShowOpeningModal(true)
        }
      } catch {
        // Network failed — restore last known session from disk cache
        const cached = await cacheGetPersistStale(`posSession:${store.posProfile}`)
        if (cached) {
          store.setPosOpeningEntry(cached.name, cached.cash, cached.user, cached.period_start_date)
        } else {
          store.setShowOpeningModal(true)
        }
      }
    }
    checkSession()
  }, [store.posProfile])

  // Global keyboard shortcuts
  // Session shortcuts — fire even when modals are open
  useEffect(() => {
    const handler = async (e) => {
      if (e.ctrlKey && e.key === 'l') { e.preventDefault(); store.lockScreen() }
      if (e.ctrlKey && e.key === 'q') {
        e.preventDefault()
        await signOut()
        store.setLoggedIn(false)
        store.setCurrentScreen('login')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (store.itemDialog || store.paymentModal || store.showOpeningModal || store.showSummaryModal || store.showReturnModal || settingsOpen || billRecallOpen) return
      const tag = document.activeElement?.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      if (e.key === 'F2') {
        e.preventDefault()
        handleSync()
      } else if (e.key === 'F5') {
        e.preventDefault()
        store.setShowSummaryModal(true)
      } else if (e.key === 'F7') {
        e.preventDefault()
        store.toggleBillType()
      } else if (e.key === 'F8') {
        e.preventDefault()
        store.toggleBillPaymentType()
      } else if (e.key === 'F3') {
        e.preventDefault()
        store.holdBill()
      } else if (e.key === 'F9') {
        e.preventDefault()
        setBillRecallOpen(true)
      } else if (e.key === 'F10') {
        e.preventDefault()
        store.setShowReturnModal(true)
      } else if (e.key === 'F12') {
        e.preventDefault()
        if (store.currentBill.items.length > 0) store.openPaymentModal()
      } else if (e.key === '+' || e.key === 'Add') {
        e.preventDefault()
        if (store.currentBill.items.length > 0) store.openPaymentModal()
      } else if (e.key === 'F1') {
        e.preventDefault()
        store.newBill()
      } else if (e.key === 'F4') {
        e.preventDefault()
        store.newBill()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    store.itemDialog, store.paymentModal,
    store.showOpeningModal, store.showSummaryModal, store.showReturnModal, settingsOpen, billRecallOpen,
    store.currentBill.items.length, store.syncStatus,
  ])

  // Persist and restore touch mode setting
  useEffect(() => {
    window.electronAPI.storeGet('touchMode').then((v) => {
      if (v != null) store.setTouchMode(v)
    })
  }, [])
  useEffect(() => {
    window.electronAPI.storeSet('touchMode', store.touchMode)
  }, [store.touchMode])

  // Online/offline detection
  useEffect(() => {
    const setOnline  = () => store.setOnline(true)
    const setOffline = () => store.setOnline(false)
    window.addEventListener('online',  setOnline)
    window.addEventListener('offline', setOffline)
    store.setOnline(navigator.onLine)
    return () => {
      window.removeEventListener('online',  setOnline)
      window.removeEventListener('offline', setOffline)
    }
  }, [])

  return (
    <div className={`flex flex-col h-screen bg-gray-900 text-white select-none${store.touchMode ? ' pb-14' : ''}`}>

      {/* ── Titlebar ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between bg-gray-800 border-b border-gray-700 px-4 py-2 flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' }}
      >
        {/* Left */}
        <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-white font-semibold text-sm">{store.posProfileData?.company || 'POS'}</span>
          </div>
          <div className="text-gray-600">|</div>
          <span className="text-gray-400 text-xs">{store.posProfile}</span>
          <div className="text-gray-600">|</div>
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${store.isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className={`text-xs ${store.isOnline ? 'text-green-400' : 'text-red-400'}`}>
              {store.isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          {queueCount > 0 && (
            <button
              onClick={() => setQueueModalOpen(true)}
              className="flex items-center gap-1 bg-yellow-900/50 border border-yellow-700 hover:border-yellow-500 rounded px-2 py-0.5 transition-colors"
              title="View and sync offline invoices"
            >
              <svg className="w-3 h-3 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-yellow-400 text-xs">{queueCount} queued</span>
            </button>
          )}
          {/* Session indicator */}
          {store.posOpeningEntry ? (
            <button
              onClick={() => store.setShowSummaryModal(true)}
              className="flex items-center gap-1.5 bg-green-900/30 border border-green-700/50 hover:border-green-500 rounded px-2 py-0.5 transition-colors"
              title="View sales summary (F5)"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-green-400 text-xs">Session Open</span>
            </button>
          ) : (
            <button
              onClick={() => store.setShowOpeningModal(true)}
              className="flex items-center gap-1.5 bg-amber-900/30 border border-amber-700/50 hover:border-amber-500 rounded px-2 py-0.5 transition-colors"
              title="Open POS session"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="text-amber-400 text-xs">No Session</span>
            </button>
          )}
          {/* Sync / Reload button */}
          <button
            onClick={handleSync}
            disabled={store.syncStatus === 'syncing'}
            title="Reload prices, items & stock from server (F2)"
            className={`flex items-center gap-1.5 rounded px-2 py-0.5 border text-xs transition-colors ${
              store.syncStatus === 'syncing'
                ? 'bg-blue-900/50 border-blue-600 text-blue-300 cursor-not-allowed'
                : store.syncStatus === 'done'
                ? 'bg-green-900/40 border-green-600 text-green-300'
                : store.syncStatus === 'error'
                ? 'bg-red-900/40 border-red-600 text-red-300'
                : 'bg-gray-700/60 border-gray-600 text-gray-400 hover:text-white hover:border-gray-400'
            }`}
          >
            <svg
              className={`w-3 h-3 ${store.syncStatus === 'syncing' ? 'animate-spin' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>
              {store.syncStatus === 'syncing' ? `${syncProgress}%`
                : store.syncStatus === 'done'  ? 'Synced'
                : store.syncStatus === 'error' ? 'Sync failed'
                : 'F2 Sync'}
            </span>
          </button>

          {/* Promo schemes indicator */}
          {store.promoSchemes?.length > 0 && (
            <span
              className="flex items-center gap-1 bg-amber-900/30 border border-amber-700/50 rounded px-2 py-0.5 text-xs text-amber-300"
              title={store.promoSchemes.map(s => s.name).join(', ')}
            >
              🎁 {store.promoSchemes.length} promo{store.promoSchemes.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Center */}
        <div className="flex items-center gap-4 text-xs text-gray-400" style={{ WebkitAppRegion: 'no-drag' }}>
          <span>{now.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
          <span>|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-white">{store.userFullName || store.username}</span>
            {store.sessionOpenedBy && store.sessionOpenedBy !== store.username && (
              <span className="text-amber-400 text-[10px]">(session by {store.sessionOpenedBy})</span>
            )}
          </div>
          <span>|</span>
          <button
            onClick={() => store.setShowSummaryModal(true)}
            className="text-gray-400 hover:text-white transition-colors"
            title="Sales Summary (F5)"
          >
            F5 Summary
          </button>
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' }}>
          <button
            onClick={() => setItemsHidden((v) => !v)}
            className={`px-2 py-1 rounded text-xs transition-colors ${itemsHidden ? 'bg-amber-700 text-amber-200' : 'bg-gray-700 text-gray-400 hover:text-white'}`}
            title="Toggle item grid panel"
          >
            {itemsHidden ? 'Show Items' : 'Hide Items'}
          </button>
          <button
            onClick={() => store.setShowImages(!store.showImages)}
            className={`px-2 py-1 rounded text-xs transition-colors ${store.showImages ? 'bg-blue-700 text-blue-200' : 'bg-gray-700 text-gray-400 hover:text-white'}`}
          >
            {store.showImages ? 'Images ON' : 'Images OFF'}
          </button>
          <button
            onClick={() => store.setTouchMode(!store.touchMode)}
            title="Toggle on-screen keyboard for touch screens"
            className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 ${store.touchMode ? 'bg-purple-700 text-purple-200' : 'bg-gray-700 text-gray-400 hover:text-white'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            {store.touchMode ? 'Touch ON' : 'Touch OFF'}
          </button>
          <button
            onClick={store.toggleTheme}
            className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          >
            {store.theme === 'dark' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
          <button
            onClick={store.lockScreen}
            title="Lock POS (Ctrl+L)"
            className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <div className="flex items-center ml-2">
            <button
              onClick={() => window.electronAPI?.minimize()}
              title="Minimize"
              className="w-8 h-7 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-600 transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 10 1" fill="currentColor"><rect width="10" height="1"/></svg>
            </button>
            <button
              onClick={() => window.electronAPI?.maximize()}
              title="Maximize / Restore"
              className="w-8 h-7 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-600 transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="0.6" y="0.6" width="8.8" height="8.8"/></svg>
            </button>
            <button
              onClick={() => window.electronAPI?.close()}
              title="Close"
              className="w-8 h-7 flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-600 transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2"><line x1="0" y1="0" x2="10" y2="10"/><line x1="10" y1="0" x2="0" y2="10"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {!itemsHidden && (
          <div className="flex flex-col border-r border-gray-700" style={{ width: '60%' }}>
            <ItemGrid />
          </div>
        )}
        <div className="flex flex-col overflow-hidden" style={{ width: itemsHidden ? '100%' : '40%' }}>
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="text-white font-semibold text-sm">Current Bill</h2>
              {store.returnCredit > 0 && (
                <span className="flex items-center gap-1 text-xs bg-amber-900/60 border border-amber-700 text-amber-300 pl-2 pr-1 py-0.5 rounded-full">
                  Return credit: {store.returnCredit.toFixed(2)}
                  <button
                    onClick={() => store.clearReturnCredit()}
                    title="Cancel return credit"
                    className="ml-0.5 text-amber-400 hover:text-red-400 transition-colors leading-none"
                  >×</button>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Retail / Wholesale toggle (F7) */}
              <button
                onClick={store.toggleBillType}
                title="Toggle Retail / Wholesale (F7)"
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
                  store.billType === 'Wholesale'
                    ? 'bg-orange-900/50 border-orange-600 text-orange-300 hover:bg-orange-800/60'
                    : 'bg-blue-900/50 border-blue-600 text-blue-300 hover:bg-blue-800/60'
                }`}
              >
                <span>{store.billType === 'Wholesale' ? '⇄ Wholesale' : '⇄ Retail'}</span>
                <span className="opacity-40 font-mono font-normal">F7</span>
              </button>

              {/* Cash / Credit toggle (F8) */}
              <button
                onClick={store.toggleBillPaymentType}
                title="Toggle Cash / Credit payment (F8)"
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
                  store.billPaymentType === 'Credit'
                    ? 'bg-amber-900/50 border-amber-600 text-amber-300 hover:bg-amber-800/60'
                    : 'bg-green-900/50 border-green-700 text-green-300 hover:bg-green-800/60'
                }`}
              >
                <span>{store.billPaymentType === 'Credit' ? '$ Credit' : '$ Cash'}</span>
                <span className="opacity-40 font-mono font-normal">F8</span>
              </button>
              <button
                onClick={() => setBillRecallOpen(true)}
                title="View / reprint a past invoice (F9)"
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border transition-colors bg-indigo-900/40 border-indigo-700 text-indigo-300 hover:bg-indigo-800/60"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                View Bill <span className="opacity-40 font-mono font-normal">F9</span>
              </button>
              <button
                onClick={() => store.setShowReturnModal(true)}
                title="Process a return / exchange"
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border transition-colors bg-red-900/40 border-red-700 text-red-300 hover:bg-red-800/60"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                Return <span className="opacity-40 font-mono font-normal">F10</span>
              </button>
              <span className="text-xs text-gray-500">{store.currentBill.items.length} items</span>
            </div>
          </div>
          {itemsHidden && <AddItemBar />}
          <BillTable landscape={itemsHidden} posImage={posImage} />
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────── */}
      <ItemDialog />
      <PaymentModal />
      <POSOpeningModal />
      <SalesSummaryModal />
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      {store.showReturnModal && <ReturnTab onClose={() => store.setShowReturnModal(false)} />}
      {billRecallOpen && <BillRecallModal onClose={() => setBillRecallOpen(false)} />}
      <VirtualKeyboard />
      {queueModalOpen && (
        <OfflineQueueModal
          onClose={() => setQueueModalOpen(false)}
          onQueueChange={(n) => setQueueCount(n)}
        />
      )}

      {/* ── Sync lock overlay ────────────────────────────────────────── */}
      {store.syncStatus === 'syncing' && (
        <div className="fixed inset-0 z-50 bg-gray-950/90 flex flex-col items-center justify-center gap-6 select-none">
          <svg className="w-12 h-12 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <div className="text-center">
            <p className="text-white font-semibold text-lg">Reloading data from server…</p>
            <p className="text-gray-400 text-sm mt-1">Please wait, the POS will unlock shortly</p>
          </div>
          {/* Progress bar */}
          <div className="w-72 bg-gray-700 rounded-full h-3 overflow-hidden">
            <div
              className="bg-blue-500 h-3 rounded-full transition-all duration-300"
              style={{ width: `${syncProgress}%` }}
            />
          </div>
          <span className="text-blue-300 font-mono text-sm">{syncProgress}%</span>
        </div>
      )}
    </div>
  )
}
