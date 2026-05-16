import { useState, useRef, useEffect } from 'react'
import { usePOSStore } from '../store/posStore'
import { searchPOSInvoices, getPOSInvoiceDetail, submitReturnInvoice } from '../services/api'

export default function ReturnTab({ onClose }) {
  const { posProfile, posOpeningEntry, setReturnCredit, clearReturnCredit, openPaymentModal } = usePOSStore()

  const [query,        setQuery]        = useState('')
  const [results,      setResults]      = useState([])
  const [searching,    setSearching]    = useState(false)
  const [searchErr,    setSearchErr]    = useState('')

  const [invoice,      setInvoice]      = useState(null)   // full doc
  const [loadingInv,   setLoadingInv]   = useState(false)

  const [returnQtys,   setReturnQtys]   = useState({})     // { item_code+idx: qty }
  const [submitting,   setSubmitting]   = useState(false)
  const [submitErr,    setSubmitErr]    = useState('')
  const [refundDone,   setRefundDone]   = useState(null)  // { credit, invoiceName } after refund-only

  const searchDebounce = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Debounced search
  useEffect(() => {
    clearTimeout(searchDebounce.current)
    const q = query.trim()
    if (!q) { setResults([]); setSearchErr(''); return }
    searchDebounce.current = setTimeout(async () => {
      setSearching(true)
      setSearchErr('')
      try {
        const rows = await searchPOSInvoices(q, posProfile)
        setResults(rows)
      } catch (e) {
        setSearchErr(e?.message || 'Search failed')
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(searchDebounce.current)
  }, [query])

  async function selectInvoice(name) {
    setLoadingInv(true)
    setSubmitErr('')
    try {
      const doc = await getPOSInvoiceDetail(name)
      setInvoice(doc)
      // Default: return all items at their original qty
      const qtys = {}
      doc.items?.forEach((item, idx) => {
        qtys[`${item.item_code}__${idx}`] = item.qty
      })
      setReturnQtys(qtys)
      setResults([])
      setQuery(doc.name)
    } catch (e) {
      setSearchErr(e?.message || 'Failed to load invoice')
    } finally {
      setLoadingInv(false)
    }
  }

  function clearInvoice() {
    setInvoice(null)
    setReturnQtys({})
    setQuery('')
    setResults([])
    setSubmitErr('')
    setTimeout(() => inputRef.current?.focus(), 60)
  }

  function totalReturnAmt() {
    if (!invoice) return 0
    return (invoice.items || []).reduce((sum, item, idx) => {
      const key = `${item.item_code}__${idx}`
      const qty = parseFloat(returnQtys[key]) || 0
      return sum + qty * (item.rate || 0)
    }, 0)
  }

  async function handleReturn(mode) {
    // mode: 'exchange' | 'refund'
    if (!invoice) return
    const returnItems = (invoice.items || [])
      .map((item, idx) => {
        const key = `${item.item_code}__${idx}`
        const qty = parseFloat(returnQtys[key]) || 0
        return { ...item, qty }
      })
      .filter((i) => i.qty > 0)

    if (returnItems.length === 0) {
      setSubmitErr('Select at least one item to return.')
      return
    }

    setSubmitting(true)
    setSubmitErr('')
    try {
      const submitted = await submitReturnInvoice(invoice, returnItems, posProfile, posOpeningEntry)
      const credit = totalReturnAmt()
      const invName = submitted?.name || (typeof submitted === 'string' ? submitted : invoice.name + '-Return')

      if (mode === 'exchange') {
        // Carry the return credit into the next sale at checkout
        setReturnCredit(credit, invName)
        onClose()
        openPaymentModal()
      } else {
        // Refund-only: show success screen — cashier gives cash back manually
        clearReturnCredit()
        setRefundDone({ credit, invoiceName: invName })
      }
    } catch (e) {
      setSubmitErr(e?.message || 'Return failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const fmt = (n) => parseFloat(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-600 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-xl">Return / Exchange</h2>
            <p className="text-gray-400 text-xs mt-0.5">Search for the original invoice to process a return</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Search bar */}
        <div className="px-6 pt-4 pb-3 flex-shrink-0">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setInvoice(null) }}
              placeholder="Search by invoice number or customer name…"
              className="w-full rounded-xl px-4 py-3 bg-gray-700 border border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm pr-10"
            />
            {searching && (
              <svg className="w-4 h-4 absolute right-3 top-3.5 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            )}
          </div>
          {searchErr && <p className="text-red-400 text-xs mt-1 pl-1">{searchErr}</p>}

          {/* Search results dropdown */}
          {results.length > 0 && !invoice && (
            <div className="mt-1 bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-xl">
              {results.map((r) => (
                <button
                  key={r.name}
                  onClick={() => selectInvoice(r.name)}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-700 transition-colors border-b border-gray-800 last:border-0"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-white text-sm font-semibold font-mono">{r.name}</span>
                      <span className="text-gray-400 text-xs ml-3">{r.customer_name || r.customer}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-green-400 text-sm font-semibold">{fmt(r.grand_total)}</span>
                      <span className="text-gray-500 text-xs ml-2">{r.posting_date}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Loading spinner */}
        {loadingInv && (
          <div className="flex items-center justify-center py-12">
            <svg className="w-8 h-8 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          </div>
        )}

        {/* Invoice detail */}
        {invoice && !loadingInv && (
          <>
            {/* Invoice summary bar */}
            <div className="mx-6 mb-3 bg-blue-900/20 border border-blue-700/50 rounded-xl px-4 py-3 flex items-center justify-between flex-shrink-0">
              <div>
                <span className="text-blue-300 font-semibold text-sm font-mono">{invoice.name}</span>
                <span className="text-gray-400 text-xs ml-3">{invoice.customer_name || invoice.customer}</span>
                <span className="text-gray-500 text-xs ml-3">{invoice.posting_date}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white font-bold text-sm">{fmt(invoice.grand_total)}</span>
                <button onClick={clearInvoice} className="text-gray-500 hover:text-red-400 text-xs border border-gray-600 hover:border-red-600 rounded px-2 py-0.5 transition-colors">
                  Change
                </button>
              </div>
            </div>

            {/* Items table */}
            <div className="flex-1 overflow-y-auto px-6 pb-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs border-b border-gray-700">
                    <th className="text-left py-2 font-medium">Item</th>
                    <th className="text-right py-2 font-medium pr-4">Rate</th>
                    <th className="text-right py-2 font-medium pr-4">Sold Qty</th>
                    <th className="text-right py-2 font-medium">Return Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoice.items || []).map((item, idx) => {
                    const key = `${item.item_code}__${idx}`
                    const retQty = returnQtys[key] ?? item.qty
                    return (
                      <tr key={key} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                        <td className="py-2.5">
                          <div className="text-white">{item.item_name}</div>
                          <div className="text-gray-500 text-xs">{item.item_code}</div>
                        </td>
                        <td className="text-right text-gray-300 pr-4 tabular-nums">{fmt(item.rate)}</td>
                        <td className="text-right text-gray-400 pr-4 tabular-nums">{item.qty}</td>
                        <td className="text-right py-2">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setReturnQtys((q) => ({ ...q, [key]: Math.max(0, (parseFloat(q[key]) || 0) - 1) }))}
                              className="w-7 h-7 rounded bg-gray-700 hover:bg-gray-600 text-white text-lg leading-none flex items-center justify-center"
                            >−</button>
                            <input
                              type="number"
                              min="0"
                              max={item.qty}
                              value={retQty}
                              onChange={(e) => {
                                const v = Math.min(item.qty, Math.max(0, parseFloat(e.target.value) || 0))
                                setReturnQtys((q) => ({ ...q, [key]: v }))
                              }}
                              className="w-14 text-center rounded bg-gray-700 border border-gray-600 text-white py-1 focus:outline-none focus:border-blue-500 tabular-nums text-sm"
                            />
                            <button
                              onClick={() => setReturnQtys((q) => ({ ...q, [key]: Math.min(item.qty, (parseFloat(q[key]) || 0) + 1) }))}
                              className="w-7 h-7 rounded bg-gray-700 hover:bg-gray-600 text-white text-lg leading-none flex items-center justify-center"
                            >+</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Return total + action buttons */}
            <div className="px-6 py-4 border-t border-gray-700 flex-shrink-0">
              <div className="flex items-center justify-between mb-4">
                <span className="text-gray-400 text-sm">Return Credit</span>
                <span className="text-white font-bold text-2xl tabular-nums">{fmt(totalReturnAmt())}</span>
              </div>

              {submitErr && (
                <div className="mb-3 bg-red-900/40 border border-red-700 rounded-lg px-4 py-2.5 text-red-300 text-sm">
                  {submitErr}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => handleReturn('exchange')}
                  disabled={submitting || !posOpeningEntry}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-3 rounded-xl transition-colors text-sm"
                >
                  {submitting ? 'Processing…' : 'Exchange / New Sale'}
                  {!submitting && <span className="block text-xs font-normal opacity-70 mt-0.5">Return credit offsets next sale</span>}
                </button>
                <button
                  onClick={() => handleReturn('refund')}
                  disabled={submitting || !posOpeningEntry}
                  className="flex-1 bg-amber-700 hover:bg-amber-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-3 rounded-xl transition-colors text-sm"
                >
                  {submitting ? 'Processing…' : 'Refund Only'}
                  {!submitting && <span className="block text-xs font-normal opacity-70 mt-0.5">Give cash back to customer</span>}
                </button>
              </div>
              {!posOpeningEntry && (
                <p className="text-amber-400 text-xs text-center mt-2">No POS session open — cannot process return</p>
              )}
            </div>
          </>
        )}

        {/* Refund-only success screen */}
        {refundDone && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 pb-8">
            <div className="w-16 h-16 rounded-full bg-green-700/40 border-2 border-green-500 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-white font-bold text-xl">Return Processed</p>
              <p className="text-gray-400 text-sm mt-1">{refundDone.invoiceName}</p>
              <p className="text-green-400 font-bold text-3xl tabular-nums mt-3">{fmt(refundDone.credit)}</p>
              <p className="text-gray-400 text-sm mt-1">Return this cash to the customer</p>
            </div>
            <button
              onClick={onClose}
              className="px-8 py-3 bg-green-700 hover:bg-green-600 text-white font-bold rounded-xl transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {/* Empty state */}
        {!invoice && !loadingInv && !query && !refundDone && (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600 pb-8">
            <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <p className="text-sm">Type an invoice number or customer name to search</p>
          </div>
        )}

      </div>
    </div>
  )
}
