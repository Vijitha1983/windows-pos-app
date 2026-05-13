import { useEffect, useRef, useState } from 'react'
import { usePOSStore } from '../store/posStore'
import { getItem, getItems, searchItems, getWarehouseStock, getBaseURL, getItemPriceListRate } from '../services/api'
import { cacheGet, cacheSet, cacheGetPersist, cacheSetPersist, cacheGetPersistStale } from '../services/cache'

export default function ItemGrid() {
  const {
    items, setItems, itemGroups, selectedGroup, setSelectedGroup,
    searchQuery, setSearchQuery, showImages,
    openItemDialog, posProfileData, itemDialog, billType,
    soldInSession, syncVersion, paymentModal,
  } = usePOSStore()

  const [loading, setLoading]           = useState(false)
  const [loadingItem, setLoadingItem]   = useState(null)
  const [errorMsg, setErrorMsg]         = useState('')
  const [focusedIdx, setFocusedIdx]     = useState(-1)
  const [stockMap, setStockMap]         = useState({})
  const [loadingStock, setLoadingStock] = useState(false)
  const [pickerResults, setPickerResults] = useState([])
  const [pickerIdx, setPickerIdx]         = useState(0)
  const [showPicker, setShowPicker]       = useState(false)

  const searchRef = useRef(null)
  const gridRef   = useRef(null)
  const itemsRef  = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])

  const warehouse = posProfileData?.warehouse

  function imgSrc(image) {
    if (!image) return null
    if (image.startsWith('http://') || image.startsWith('https://')) return image
    return getBaseURL().replace(/\/$/, '') + image
  }

  // Load stock — memory → disk → network; re-runs when syncVersion bumps
  useEffect(() => {
    if (!warehouse) return
    const key = `stock:${warehouse}`
    let cancelled = false
    async function loadStock() {
      // Memory hit
      const mem = cacheGet(key)
      if (mem) { setStockMap(mem); return }
      // Disk fallback — use stale data when offline (better than no stock display)
      const disk = await cacheGetPersistStale(key)
      if (disk) { setStockMap(disk); return }
      // Network fetch
      setLoadingStock(true)
      try {
        const map = await getWarehouseStock(warehouse)
        if (!cancelled) {
          setStockMap(map)
          await cacheSetPersist(key, map)
        }
      } catch { /* stay with whatever we have */ }
      finally { if (!cancelled) setLoadingStock(false) }
    }
    loadStock()
    return () => { cancelled = true }
  }, [warehouse, syncVersion])

  // Auto-refocus search after ItemDialog closes — clear picker so it doesn't reappear
  useEffect(() => {
    if (!itemDialog) {
      setShowPicker(false)
      setPickerResults([])
      setSearchQuery('')
      setTimeout(() => { searchRef.current?.focus() }, 80)
    }
  }, [itemDialog])

  // Auto-refocus search after PaymentModal closes (checkout complete or cancelled)
  useEffect(() => {
    if (!paymentModal) {
      setTimeout(() => { searchRef.current?.focus() }, 150)
    }
  }, [paymentModal])

  // Focus search on F1 / Ctrl+F
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'F1' || (e.ctrlKey && e.key === 'f')) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Load grid items when group/search changes
  useEffect(() => {
    const timer = setTimeout(loadItems, searchQuery ? 300 : 0)
    return () => clearTimeout(timer)
  }, [selectedGroup, searchQuery])

  // Picker results: refresh when search query changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setPickerResults([])
      setShowPicker(false)
      return
    }
    const timer = setTimeout(async () => {
      // Online: try server search
      if (navigator.onLine) {
        try {
          const results = await searchItems(searchQuery)
          setPickerResults(results)
          setShowPicker(results.length > 0)
          setPickerIdx(0)
          return
        } catch { /* fall through to offline filter */ }
      }
      // Offline (or server unreachable): filter from cache
      const allItems = cacheGet('items:All:')
        || await cacheGetPersistStale('items:All:')
        || itemsRef.current
      const q = searchQuery.toLowerCase()
      const filtered = (allItems || []).filter((it) =>
        it.item_name?.toLowerCase().includes(q) ||
        it.item_code?.toLowerCase().includes(q)
      )
      setPickerResults(filtered)
      setShowPicker(filtered.length > 0)
      setPickerIdx(0)
    }, 200)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Returns cached items for any group/search without touching the network.
  // Falls back: exact disk key → All-items disk cache filtered → in-memory items.
  async function serveCachedItems() {
    const exactDisk = await cacheGetPersistStale(`items:${selectedGroup}:${searchQuery}`)
    if (exactDisk) { setItems(exactDisk); return true }

    const allItems = cacheGet('items:All:')
      || await cacheGetPersistStale('items:All:')
      || itemsRef.current

    if (!allItems || allItems.length === 0) return false

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const filtered = allItems.filter((it) =>
        it.item_name?.toLowerCase().includes(q) ||
        it.item_code?.toLowerCase().includes(q)
      )
      setItems(filtered.length > 0 ? filtered : allItems)
    } else {
      setItems(allItems)
    }
    return true
  }

  async function loadItems() {
    setLoading(true)
    try {
      const key = `items:${selectedGroup}:${searchQuery}`
      // 1. Memory hit
      const mem = cacheGet(key)
      if (mem) { setItems(mem); return }

      // 2. Offline — skip network entirely, serve from disk/memory cache
      if (!navigator.onLine) {
        const served = await serveCachedItems()
        if (!served) showError('Offline — press F2 after reconnecting to cache items')
        return
      }

      // 3. Online + no search: try disk cache for instant display
      if (!searchQuery) {
        const disk = await cacheGetPersist(key)
        if (disk) { setItems(disk); return }
      }

      // 4. Network fetch
      const data = searchQuery
        ? await searchItems(searchQuery)
        : await getItems(selectedGroup !== 'All' ? { itemGroup: selectedGroup } : {}, 100)
      setItems(data)
      if (!searchQuery) await cacheSetPersist(key, data)
      else cacheSet(key, data)
    } catch {
      // Network call failed (server down, timeout, etc.) — serve from any cache
      const served = await serveCachedItems()
      if (!served) showError('Cannot reach server — connect to ERPNext to enable offline mode')
    } finally {
      setLoading(false)
    }
  }

  function showError(msg) {
    setErrorMsg(msg)
    setTimeout(() => setErrorMsg(''), 12000)
  }

  // Grid keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (document.activeElement === searchRef.current) return
      if (!items.length) return
      const cols = getColumnCount()
      if (e.key === 'ArrowRight') { e.preventDefault(); setFocusedIdx((i) => Math.min(i + 1, items.length - 1)) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setFocusedIdx((i) => Math.max(i - 1, 0)) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx((i) => Math.min(i + cols, items.length - 1)) }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusedIdx((i) => Math.max(i - cols, 0)) }
      else if (e.key === 'Enter' && focusedIdx >= 0) { e.preventDefault(); e.stopPropagation(); handleItemClick(items[focusedIdx]) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [items, focusedIdx])

  function getColumnCount() {
    const grid = gridRef.current
    if (!grid) return 4
    return window.getComputedStyle(grid).gridTemplateColumns.split(' ').length || 4
  }

  async function handleItemClick(item, fromPicker = false) {
    if (loadingItem) return
    if (fromPicker) { setShowPicker(false); setSearchQuery('') }
    setLoadingItem(item.item_code)
    try {
      const key = `item:${item.item_code}`
      let full = cacheGet(key)  // memory cache — valid for 5 min within session
      if (!full) {
        if (navigator.onLine) {
          // Always fetch fresh from network so selling levels / prices are current
          full = await getItem(item.item_code)
          cacheSet(key, full)
          cacheSetPersist(key, full)
        } else {
          // Offline: use last persisted version as fallback
          const disk = await cacheGetPersistStale(key)
          full = disk || {
            ...item,
            has_serial_no: 0,
            has_batch_no: 0,
            stock_uom: item.stock_uom || item.uom || 'Nos',
            custom_price_selling_levels: [],
          }
          cacheSet(key, full)
        }
      }
      const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, '')
      const levels = (full.custom_price_selling_levels || []).filter((l) => {
        const isActive = l.active == null || l.active === 1 || l.active === true || l.active === '1'
        if (!isActive) return false
        if (!l.bill_type) return true
        return norm(l.bill_type) === norm(billType)
      })
      if (levels.length === 0 && posProfileData?.selling_price_list) {
        const rate = await getItemPriceListRate(full.item_code, posProfileData.selling_price_list)
        if (rate !== null) full = { ...full, price_list_rate: rate }
      }
      openItemDialog(full, levels)
    } catch (err) {
      showError('Could not load item: ' + (err.message || 'Network error'))
    } finally {
      setLoadingItem(null)
    }
  }

  // Barcode scanner (fast keystroke burst)
  const barcodeBuffer = useRef('')
  const barcodeTimer  = useRef(null)
  useEffect(() => {
    const handler = (e) => {
      if (document.activeElement === searchRef.current) return
      if (e.key.length !== 1) return
      barcodeBuffer.current += e.key
      clearTimeout(barcodeTimer.current)
      barcodeTimer.current = setTimeout(async () => {
        const code = barcodeBuffer.current.trim()
        barcodeBuffer.current = ''
        if (code.length < 3) return
        try {
          const results = await searchItems(code)
          if (results.length === 1) {
            handleItemClick(results[0])
          } else if (results.length > 1) {
            setPickerResults(results)
            setShowPicker(true)
            setPickerIdx(0)
            setSearchQuery(code)
            searchRef.current?.focus()
          }
        } catch {}
      }, 120)
    }
    window.addEventListener('keypress', handler)
    return () => window.removeEventListener('keypress', handler)
  }, [])

  function handleSearchKeyDown(e) {
    if (!showPicker || pickerResults.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setPickerIdx((i) => Math.min(i + 1, pickerResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setPickerIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleItemClick(pickerResults[pickerIdx], true)
    } else if (e.key === 'Escape') {
      setShowPicker(false)
      setSearchQuery('')
    }
  }

  return (
    <div className="flex flex-col h-full">

      {/* Search + picker dropdown */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0 relative">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search by name, item code or scan barcode… (F1)"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPickerIdx(0) }}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => { if (searchQuery && pickerResults.length > 0) setShowPicker(true) }}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-9 pr-8 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setShowPicker(false) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-lg leading-none"
            >×</button>
          )}
        </div>

        {/* Floating search results picker */}
        {showPicker && pickerResults.length > 0 && (
          <div className="absolute left-4 right-4 top-full mt-1 z-30 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl overflow-y-auto" style={{ maxHeight: '300px' }}>
            {pickerResults.map((item, idx) => {
              const rawQty = stockMap[item.item_code]
              const qty = rawQty !== undefined ? Math.max(0, rawQty - (soldInSession[item.item_code] || 0)) : undefined
              const hasStock = !loadingStock && qty !== undefined
              return (
                <button
                  key={item.item_code}
                  onClick={() => handleItemClick(item, true)}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 border-b border-gray-700/40 last:border-0 transition-colors ${
                    pickerIdx === idx ? 'bg-blue-700/40' : 'hover:bg-gray-700/60'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium truncate">{item.item_name}</div>
                    <div className="text-gray-400 text-xs">{item.item_code}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-blue-400 text-sm font-bold tabular-nums">
                      {parseFloat(item.standard_rate || 0).toFixed(2)}
                    </div>
                    {hasStock && (
                      <div className={`text-xs font-semibold ${qty > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {qty > 0 ? `Stock: ${qty}` : 'Out of stock'}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Category tabs */}
      <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none flex-shrink-0">
        {['All', ...itemGroups.map((g) => g.name)].map((grp) => (
          <button
            key={grp}
            onClick={() => { setSelectedGroup(grp); setShowPicker(false) }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedGroup === grp
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/50'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {grp}
          </button>
        ))}
      </div>

      {/* Error toast */}
      {errorMsg && (
        <div className="mx-4 mb-2 bg-red-900/50 border border-red-700 text-red-300 text-xs px-3 py-2 rounded-lg flex-shrink-0 flex items-center justify-between gap-3">
          <span className="flex-1">{errorMsg}</span>
          <button
            onClick={() => { setErrorMsg(''); loadItems() }}
            className="flex-shrink-0 border border-red-600 hover:border-red-400 hover:text-white rounded px-2 py-0.5 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Item grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-4" onClick={() => setShowPicker(false)}>
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Loading items…
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
            No items found
          </div>
        ) : (
          <div
            ref={gridRef}
            className="grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}
          >
            {items.map((item, idx) => {
              const isFetching = loadingItem === item.item_code
              const isFocused  = focusedIdx === idx
              const rawQty     = stockMap[item.item_code]
              const qty        = rawQty !== undefined ? Math.max(0, rawQty - (soldInSession[item.item_code] || 0)) : undefined
              const hasStock   = !loadingStock && qty !== undefined

              return (
                <button
                  key={item.item_code}
                  onClick={() => handleItemClick(item)}
                  onFocus={() => setFocusedIdx(idx)}
                  disabled={!!loadingItem}
                  className={`relative text-left rounded-xl p-3 transition-all border-2 ${
                    isFocused
                      ? 'border-blue-500 bg-blue-900/30 shadow-lg shadow-blue-900/20'
                      : 'border-transparent bg-gray-700 hover:bg-gray-600 hover:border-gray-500'
                  } ${loadingItem && !isFetching ? 'opacity-50' : ''}`}
                >
                  {/* Loading overlay */}
                  {isFetching && (
                    <div className="absolute inset-0 bg-gray-900/60 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                    </div>
                  )}

                  {showImages && item.image && (
                    <img
                      src={imgSrc(item.image)}
                      alt={item.item_name}
                      className="w-full h-20 object-cover rounded-lg mb-2"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                  )}

                  <div className="text-white text-xs font-semibold leading-tight line-clamp-2">
                    {item.item_name}
                  </div>
                  <div className="text-gray-500 text-xs mt-0.5">{item.item_code}</div>

                  {/* Price + Stock balance row */}
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="text-blue-400 text-sm font-bold tabular-nums">
                      {parseFloat(item.standard_rate || 0).toFixed(2)}
                    </div>
                    {hasStock && (
                      <div className={`text-xs font-semibold tabular-nums ${qty > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {qty > 0 ? qty : 'Out'}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
