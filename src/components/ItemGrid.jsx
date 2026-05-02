import { useEffect, useRef, useState } from 'react'
import { usePOSStore } from '../store/posStore'
import { getItem, getItems, searchItems } from '../services/api'
import { cacheGet, cacheSet } from '../services/cache'

export default function ItemGrid() {
  const {
    items, setItems, itemGroups, selectedGroup, setSelectedGroup,
    searchQuery, setSearchQuery, showImages,
    openItemDialog,
  } = usePOSStore()

  const [loading, setLoading]         = useState(false)
  const [loadingItem, setLoadingItem] = useState(null)  // item_code currently fetching
  const [errorMsg, setErrorMsg]       = useState('')
  const [focusedIdx, setFocusedIdx]   = useState(-1)
  const [hiddenItems, setHiddenItems] = useState(new Set())
  const [showHidden, setShowHidden]   = useState(false)
  const searchRef = useRef(null)
  const gridRef   = useRef(null)

  // Load hidden items from store on mount
  useEffect(() => {
    window.electronAPI.storeGet('hiddenItems').then((v) => setHiddenItems(new Set(v || [])))
  }, [])

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

  // Load items when group or search changes
  useEffect(() => {
    const timer = setTimeout(loadItems, searchQuery ? 300 : 0)
    return () => clearTimeout(timer)
  }, [selectedGroup, searchQuery])

  async function loadItems() {
    setLoading(true)
    try {
      const key = `items:${selectedGroup}:${searchQuery}`
      const cached = cacheGet(key)
      if (cached) { setItems(cached); return }

      const data = searchQuery
        ? await searchItems(searchQuery)
        : await getItems(selectedGroup !== 'All' ? { itemGroup: selectedGroup } : {}, 100)

      cacheSet(key, data)
      setItems(data)
    } catch (err) {
      showError('Failed to load items: ' + (err.message || 'Network error'))
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
      else if (e.key === 'Enter' && focusedIdx >= 0) { e.preventDefault(); handleItemClick(items[focusedIdx]) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [items, focusedIdx])

  function getColumnCount() {
    const grid = gridRef.current
    if (!grid) return 4
    return window.getComputedStyle(grid).gridTemplateColumns.split(' ').length || 4
  }

  // ── Main item-click handler ──────────────────────────────────────────────
  async function handleItemClick(item) {
    if (loadingItem) return            // prevent double-tap while fetching
    setLoadingItem(item.item_code)
    try {
      // Fetch full item (includes custom_price_selling_levels child table)
      const key = `item:${item.item_code}`
      let full = cacheGet(key)
      if (!full) {
        full = await getItem(item.item_code)
        cacheSet(key, full)
      }

      // Filter to only active price levels
      const levels = (full.custom_price_selling_levels || []).filter(
        (l) => l.active === 1 || l.active === true || l.active === '1'
      )

      // Always open the unified dialog (handles 0, 1, or many price levels)
      openItemDialog(full, levels)
    } catch (err) {
      showError('Could not load item: ' + (err.message || 'Network error'))
    } finally {
      setLoadingItem(null)
    }
  }

  // ── Barcode scanner (fast keystroke burst → auto-search) ─────────────────
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
          } else {
            setSearchQuery(code)
            searchRef.current?.focus()
          }
        } catch {}
      }, 120)
    }
    window.addEventListener('keypress', handler)
    return () => window.removeEventListener('keypress', handler)
  }, [])

  async function toggleHideItem(e, item_code) {
    e.stopPropagation()
    e.preventDefault()
    const next = new Set(hiddenItems)
    if (next.has(item_code)) { next.delete(item_code) } else { next.add(item_code) }
    setHiddenItems(next)
    await window.electronAPI.storeSet('hiddenItems', [...next])
  }

  const displayItems = showHidden ? items : items.filter((item) => !hiddenItems.has(item.item_code))

  return (
    <div className="flex flex-col h-full">

      {/* Search */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search items or scan barcode… (F1)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-9 pr-8 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-lg leading-none"
            >×</button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none flex-shrink-0">
        {['All', ...itemGroups.map((g) => g.name)].map((grp) => (
          <button
            key={grp}
            onClick={() => setSelectedGroup(grp)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedGroup === grp
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/50'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {grp}
          </button>
        ))}
        {hiddenItems.size > 0 && (
          <button
            onClick={() => setShowHidden((v) => !v)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ml-auto ${
              showHidden
                ? 'bg-amber-600 text-white'
                : 'bg-gray-700/60 text-amber-500 border border-amber-700/50 hover:bg-gray-600'
            }`}
          >
            {showHidden ? `Hide hidden (${hiddenItems.size})` : `${hiddenItems.size} hidden`}
          </button>
        )}
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
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Loading items…
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
            {hiddenItems.size > 0 && !showHidden ? 'All items hidden — click the amber button to show' : 'No items found'}
          </div>
        ) : (
          <div
            ref={gridRef}
            className="grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}
          >
            {displayItems.map((item, idx) => {
              const isFetching = loadingItem === item.item_code
              const isFocused  = focusedIdx === idx
              const isHidden   = hiddenItems.has(item.item_code)
              return (
                <button
                  key={item.item_code}
                  onClick={() => handleItemClick(item)}
                  onFocus={() => setFocusedIdx(idx)}
                  disabled={!!loadingItem}
                  className={`group relative text-left rounded-xl p-3 transition-all border-2 ${
                    isFocused
                      ? 'border-blue-500 bg-blue-900/30 shadow-lg shadow-blue-900/20'
                      : isHidden
                        ? 'border-dashed border-amber-700/50 bg-gray-800/60 opacity-60 hover:opacity-100 hover:border-amber-500'
                        : 'border-transparent bg-gray-700 hover:bg-gray-600 hover:border-gray-500'
                  } ${loadingItem && !isFetching ? 'opacity-50' : ''}`}
                >
                  {/* Hide/unhide button — visible on hover */}
                  <span
                    onClick={(e) => toggleHideItem(e, item.item_code)}
                    title={isHidden ? 'Show item' : 'Hide item'}
                    className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs leading-none z-10 transition-opacity cursor-pointer select-none ${
                      isHidden
                        ? 'bg-amber-700/80 text-amber-200 opacity-100'
                        : 'bg-gray-600/80 text-gray-400 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {isHidden ? '↩' : '−'}
                  </span>

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
                      src={item.image}
                      alt={item.item_name}
                      className="w-full h-20 object-cover rounded-lg mb-2"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                  )}

                  <div className="text-white text-xs font-semibold leading-tight line-clamp-2">
                    {item.item_name}
                  </div>
                  <div className="text-gray-500 text-xs mt-0.5">{item.item_code}</div>
                  <div className="text-blue-400 text-sm font-bold mt-1.5 tabular-nums">
                    {parseFloat(item.standard_rate || 0).toFixed(2)}
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
