import { useEffect, useRef, useState } from 'react'
import { usePOSStore } from '../store/posStore'
import { getItemGroups, getOpenPOSSession } from '../services/api'
import { cacheGet, cacheSet, getQueuedInvoices } from '../services/cache'
import ItemGrid from './ItemGrid'
import BillTable from './BillTable'
import ItemDialog from './ItemDialog'
import PaymentModal from './PaymentModal'
import POSOpeningModal from './POSOpeningModal'
import SalesSummaryModal from './SalesSummaryModal'
import Settings from './Settings'

export default function POSMain() {
  const store = usePOSStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [queueCount, setQueueCount]     = useState(0)
  const now = new Date()

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

  // Load item groups
  useEffect(() => {
    async function load() {
      const cached = cacheGet('itemGroups')
      if (cached) { store.setItemGroups(cached); return }
      try {
        const groups = await getItemGroups()
        store.setItemGroups(groups)
        cacheSet('itemGroups', groups)
      } catch (err) {
        console.error('Failed to load item groups', err)
      }
    }
    load()
  }, [])

  // Check for an existing open POS session; if none, prompt to open one
  useEffect(() => {
    if (!store.posProfile) return
    async function checkSession() {
      try {
        const session = await getOpenPOSSession(store.posProfile)
        if (session) {
          // Restore existing session
          const cash = (session.balance_details || [])
            .find((b) => b.mode_of_payment?.toLowerCase().includes('cash'))
            ?.opening_amount || 0
          store.setPosOpeningEntry(session.name, cash)
        } else {
          store.setShowOpeningModal(true)
        }
      } catch {
        // Can't check (network issue etc.) — show opening modal anyway
        store.setShowOpeningModal(true)
      }
    }
    checkSession()
  }, [store.posProfile])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (store.itemDialog || store.paymentModal || store.showOpeningModal || store.showSummaryModal || settingsOpen) return
      const tag = document.activeElement?.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      if (e.key === 'F5') {
        e.preventDefault()
        store.setShowSummaryModal(true)
      } else if (e.key === 'F12') {
        e.preventDefault()
        if (store.currentBill.items.length > 0) store.openPaymentModal()
      } else if (e.key === 'F1' && !inInput) {
        e.preventDefault()
        store.newBill()
      } else if (e.key === 'F2') {
        e.preventDefault()
        store.holdBill()
      } else if (e.key === 'F4') {
        e.preventDefault()
        store.newBill()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    store.itemDialog, store.paymentModal,
    store.showOpeningModal, store.showSummaryModal, settingsOpen,
    store.currentBill.items.length,
  ])

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
    <div className="flex flex-col h-screen bg-gray-900 text-white select-none">

      {/* ── Titlebar ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between bg-gray-800 border-b border-gray-700 px-4 py-2 flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' }}
      >
        {/* Left */}
        <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-white font-semibold text-sm">ERPNext POS</span>
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
            <div className="flex items-center gap-1 bg-yellow-900/50 border border-yellow-700 rounded px-2 py-0.5">
              <span className="text-yellow-400 text-xs">{queueCount} queued</span>
            </div>
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
        </div>

        {/* Center */}
        <div className="flex items-center gap-4 text-xs text-gray-400" style={{ WebkitAppRegion: 'no-drag' }}>
          <span>{now.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
          <span>|</span>
          <span>{store.username}</span>
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
            onClick={() => store.setShowImages(!store.showImages)}
            className={`px-2 py-1 rounded text-xs transition-colors ${store.showImages ? 'bg-blue-700 text-blue-200' : 'bg-gray-700 text-gray-400 hover:text-white'}`}
          >
            {store.showImages ? 'Images ON' : 'Images OFF'}
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
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <div className="flex items-center ml-2 gap-1">
            <button onClick={() => window.electronAPI?.minimize()} className="w-5 h-5 rounded-full bg-yellow-500 hover:bg-yellow-400 transition-colors flex items-center justify-center text-yellow-900 text-xs">−</button>
            <button onClick={() => window.electronAPI?.maximize()} className="w-5 h-5 rounded-full bg-green-500 hover:bg-green-400 transition-colors" />
            <button onClick={() => window.electronAPI?.close()} className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-400 transition-colors flex items-center justify-center text-red-900 text-xs">×</button>
          </div>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col border-r border-gray-700" style={{ width: '60%' }}>
          <ItemGrid />
        </div>
        <div className="flex flex-col" style={{ width: '40%' }}>
          <div className="px-4 py-2.5 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
            <h2 className="text-white font-semibold text-sm">Current Bill</h2>
            <span className="text-xs text-gray-500">{store.currentBill.items.length} items</span>
          </div>
          <BillTable />
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────── */}
      <ItemDialog />
      <PaymentModal />
      <POSOpeningModal />
      <SalesSummaryModal />
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
