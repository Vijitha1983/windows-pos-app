import { useEffect, useRef, useState } from 'react'
import { getCustomers } from '../services/api'
import { usePOSStore } from '../store/posStore'

export default function CustomerSearch() {
  const { currentBill, setCustomer, posProfileData } = usePOSStore()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef(null)
  const debounce = useRef(null)

  const customer = currentBill.customer
  const defaultCustomerName = posProfileData?.customer || 'Walk-in Customer'

  // F9 opens the customer search from anywhere on the POS screen
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'F9') { e.preventDefault(); setOpen(true) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!open) return
    setTimeout(() => inputRef.current?.focus(), 40)
    loadCustomers('')
  }, [open])

  useEffect(() => {
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => loadCustomers(query), 250)
  }, [query])

  async function loadCustomers(q) {
    setLoading(true)
    try {
      const data = await getCustomers(q)
      setResults(data)
      setSelectedIdx(0)
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, results.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)) }
      else if (e.key === 'Enter' && results[selectedIdx]) { e.preventDefault(); handleSelect(results[selectedIdx]) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, results, selectedIdx])

  function handleSelect(c) {
    setCustomer(c)
    setOpen(false)
    setQuery('')
  }

  function handleClear(e) {
    e.stopPropagation()
    setCustomer(null)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg px-3 py-1.5 text-sm transition-colors w-full text-left"
      >
        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        {customer ? (
          <span className="text-white flex-1 truncate">{customer.customer_name}</span>
        ) : (
          <span className="text-gray-400 flex-1">
            {defaultCustomerName}
            <span className="ml-2 text-gray-600 text-xs font-mono">F9</span>
          </span>
        )}
        {customer && (
          <span
            onClick={handleClear}
            className="text-gray-500 hover:text-red-400 transition-colors ml-1 cursor-pointer"
          >×</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 pt-24 px-4">
          <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-700">
            <div className="px-4 pt-4 pb-2">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search customer by name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="max-h-64 overflow-y-auto">
              {loading ? (
                <div className="text-center py-6 text-gray-500 text-sm">Searching…</div>
              ) : results.length === 0 ? (
                <div className="text-center py-6 text-gray-500 text-sm">No customers found</div>
              ) : (
                results.map((c, i) => (
                  <button
                    key={c.name}
                    onClick={() => handleSelect(c)}
                    className={`w-full text-left px-4 py-3 transition-colors border-b border-gray-700 last:border-0 ${
                      i === selectedIdx ? 'bg-blue-600 text-white' : 'text-gray-200 hover:bg-gray-700'
                    }`}
                  >
                    <div className="font-medium text-sm">{c.customer_name}</div>
                    {c.mobile_no && <div className="text-xs text-gray-400">{c.mobile_no}</div>}
                  </button>
                ))
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-gray-700 text-xs text-gray-500">
              ↑↓ Navigate · Enter Select · ESC Cancel
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
