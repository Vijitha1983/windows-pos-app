import { useEffect, useRef, useState } from 'react'
import { usePOSStore } from '../store/posStore'
import { getItem, searchItems } from '../services/api'
import { cacheGet, cacheSet } from '../services/cache'

export default function AddItemBar() {
  const { openItemDialog } = usePOSStore()
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [idx,     setIdx]     = useState(0)
  const [show,    setShow]    = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  // Fetch results when query changes
  useEffect(() => {
    if (!query.trim()) { setResults([]); setShow(false); return }
    const t = setTimeout(async () => {
      try {
        const r = await searchItems(query)
        setResults(r)
        setShow(r.length > 0)
        setIdx(0)
      } catch {}
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  async function selectItem(item) {
    setShow(false)
    setQuery('')
    setLoading(true)
    try {
      const key = `item:${item.item_code}`
      let full = cacheGet(key)
      if (!full) { full = await getItem(item.item_code); cacheSet(key, full) }
      const levels = (full.custom_price_selling_levels || []).filter(
        (l) => l.active === 1 || l.active === true || l.active === '1'
      )
      openItemDialog(full, levels)
    } catch {}
    setLoading(false)
  }

  function handleKeyDown(e) {
    if (!show || results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); selectItem(results[idx]) }
    else if (e.key === 'Escape') { setShow(false); setQuery('') }
  }

  return (
    <div className="px-3 py-2 bg-gray-800/60 border-b border-gray-700 relative flex-shrink-0">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder="Add item — search by name, code or scan barcode…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (query && results.length > 0) setShow(true) }}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-8 pr-7 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-xs"
        />
        {(query || loading) && (
          <button
            onClick={() => { setQuery(''); setShow(false) }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-base leading-none"
          >
            {loading ? (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            ) : '×'}
          </button>
        )}
      </div>

      {/* Dropdown */}
      {show && results.length > 0 && (
        <div className="absolute left-3 right-3 top-full mt-0.5 z-30 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl overflow-y-auto" style={{ maxHeight: '280px' }}>
          {results.map((item, i) => (
            <button
              key={item.item_code}
              onClick={() => selectItem(item)}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 border-b border-gray-700/40 last:border-0 transition-colors ${
                idx === i ? 'bg-blue-700/40' : 'hover:bg-gray-700/60'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium truncate">{item.item_name}</div>
                <div className="text-gray-400 text-xs">{item.item_code}</div>
              </div>
              <div className="text-blue-400 text-sm font-bold tabular-nums flex-shrink-0">
                {parseFloat(item.standard_rate || 0).toFixed(2)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
