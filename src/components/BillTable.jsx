import { useEffect, useRef, useState } from 'react'
import { usePOSStore } from '../store/posStore'
import CustomerSearch from './CustomerSearch'
import { getCustomerOutstandingInvoices } from '../services/api'

export default function BillTable() {
  const {
    currentBill, updateItemQty, removeItem, selectedRow, setSelectedRow,
    setDiscount, getSubTotal, getDiscountAmount, getGrandTotal,
    openPaymentModal, newBill, holdBill, heldBills, recallBill,
  } = usePOSStore()

  const [editingId, setEditingId] = useState(null)
  const [editQty, setEditQty] = useState('')
  const [discountInput, setDiscountInput] = useState('')
  const [discountType, setDiscountType] = useState('amount')
  const [showHeld, setShowHeld] = useState(false)
  const editRef = useRef(null)
  const discountInputRef = useRef(null)

  // Receivable aging
  const [aging, setAging] = useState(null)
  const [agingLoading, setAgingLoading] = useState(false)
  const [showAgingDetail, setShowAgingDetail] = useState(false)

  useEffect(() => {
    const customer = currentBill.customer
    if (!customer) { setAging(null); return }
    let cancelled = false
    setAgingLoading(true)
    setAging(null)
    getCustomerOutstandingInvoices(customer.name).then((invoices) => {
      if (cancelled) return
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const buckets = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0, total: 0 }
      const details = []
      invoices.forEach((inv) => {
        const due = new Date(inv.due_date || inv.posting_date)
        const days = Math.floor((today - due) / 86400000)
        const amt = parseFloat(inv.outstanding_amount || 0)
        buckets.total += amt
        if (days <= 0)       buckets.current += amt
        else if (days <= 30) buckets.d30 += amt
        else if (days <= 60) buckets.d60 += amt
        else if (days <= 90) buckets.d90 += amt
        else                 buckets.over90 += amt
        details.push({ name: inv.name, due: inv.due_date || inv.posting_date, days, amt })
      })
      setAging({ buckets, details })
    }).catch(() => setAging(null)).finally(() => { if (!cancelled) setAgingLoading(false) })
    return () => { cancelled = true }
  }, [currentBill.customer])

  const items = currentBill.items
  const subTotal = getSubTotal()
  const discountAmt = getDiscountAmount()
  const grandTotal = getGrandTotal()

  // Auto-focus qty input when editing starts
  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus()
      editRef.current.select()
    }
  }, [editingId])

  // Keyboard navigation within the bill table
  useEffect(() => {
    const handler = (e) => {
      if (editingId) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'SELECT') return

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedRow(Math.max(0, selectedRow - 1))
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedRow(Math.min(items.length - 1, selectedRow + 1))
      } else if ((e.key === 'Delete') && selectedRow >= 0 && items[selectedRow]) {
        e.preventDefault()
        removeItem(items[selectedRow].id)
        setSelectedRow(Math.max(0, selectedRow - 1))
      } else if (e.key === 'Enter' && selectedRow >= 0 && items[selectedRow]) {
        e.preventDefault()
        startEdit(items[selectedRow])
      } else if (e.key === 'F6') {
        e.preventDefault()
        discountInputRef.current?.focus()
        discountInputRef.current?.select()
      } else if (e.key === '-' || e.key === 'Subtract') {
        e.preventDefault()
        setShowHeld(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedRow, items, editingId])

  function startEdit(item) {
    setEditingId(item.id)
    setEditQty(String(item.qty))
  }

  function commitEdit(id) {
    const q = parseFloat(editQty)
    if (!isNaN(q) && q > 0) updateItemQty(id, q)
    else if (!isNaN(q) && q <= 0) removeItem(id)
    setEditingId(null)
  }

  function handleDiscountApply() {
    const val = parseFloat(discountInput) || 0
    setDiscount(val, discountType)
  }

  const fmt = (n) => parseFloat(n || 0).toFixed(2)

  return (
    <div className="flex flex-col h-full">

      {/* Customer */}
      <div className="px-3 py-2 border-b border-gray-700 flex-shrink-0">
        <CustomerSearch />
      </div>

      {/* Receivable Aging — shown when a named customer is selected */}
      {currentBill.customer && (
        <div className="px-3 py-2 border-b border-gray-700 flex-shrink-0 bg-gray-850">
          {agingLoading ? (
            <div className="text-xs text-gray-500 text-center py-1">Loading receivables…</div>
          ) : aging && aging.buckets.total > 0 ? (
            <div>
              <button
                onClick={() => setShowAgingDetail((v) => !v)}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-400 font-medium">Receivable Aging</span>
                  <span className="text-xs font-bold text-red-400 tabular-nums">
                    Total: {fmt(aging.buckets.total)}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1 text-center">
                  {[
                    { label: 'Current', val: aging.buckets.current, color: 'text-green-400 bg-green-900/30 border-green-800' },
                    { label: '1–30d',   val: aging.buckets.d30,     color: 'text-yellow-400 bg-yellow-900/30 border-yellow-800' },
                    { label: '31–60d',  val: aging.buckets.d60,     color: 'text-orange-400 bg-orange-900/30 border-orange-800' },
                    { label: '61–90d',  val: aging.buckets.d90,     color: 'text-red-400 bg-red-900/30 border-red-800' },
                    { label: '90d+',    val: aging.buckets.over90,  color: 'text-red-300 bg-red-950/50 border-red-900' },
                  ].map(({ label, val, color }) => (
                    <div key={label} className={`rounded border px-1 py-0.5 ${color}`}>
                      <div className="text-[9px] opacity-70 leading-none mb-0.5">{label}</div>
                      <div className="text-[10px] font-bold tabular-nums leading-none">{fmt(val)}</div>
                    </div>
                  ))}
                </div>
              </button>
              {showAgingDetail && aging.details.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto space-y-0.5">
                  {aging.details.map((d) => (
                    <div key={d.name} className="flex justify-between text-[10px] text-gray-400 px-1">
                      <span className="truncate flex-1 mr-2">{d.name}</span>
                      <span className={`tabular-nums ${d.days > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {d.days > 0 ? `${d.days}d overdue` : 'current'}
                      </span>
                      <span className="tabular-nums ml-2 text-white font-medium">{fmt(d.amt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : aging && aging.buckets.total === 0 ? (
            <div className="text-xs text-green-500 text-center py-0.5">No outstanding receivables</div>
          ) : null}
        </div>
      )}

      {/* ── Bill items table ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
            <svg className="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="text-sm">Select items to add</span>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-800 border-b-2 border-gray-600">
                <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-400 w-7">#</th>
                <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-400">Item</th>
                <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-400 w-20">Qty</th>
                <th className="px-2 py-2.5 text-right text-xs font-semibold text-gray-400 w-24">Unit Price</th>
                <th className="px-2 py-2.5 text-right text-xs font-semibold text-gray-400 w-24">Amount</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr
                  key={item.id}
                  onClick={() => setSelectedRow(idx)}
                  className={`border-b border-gray-700/60 cursor-pointer transition-colors ${
                    selectedRow === idx
                      ? 'bg-blue-900/40 border-blue-700/50'
                      : 'hover:bg-gray-700/30'
                  }`}
                >
                  {/* # */}
                  <td className="px-2 py-2.5 text-gray-500 text-xs">{idx + 1}</td>

                  {/* Item name + code + price level */}
                  <td className="px-2 py-2.5 max-w-0">
                    <div className="text-white font-medium text-xs leading-snug truncate">
                      {item.item_name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-gray-500 text-xs">{item.item_code}</span>
                      {item.priceLevel && item.priceLevel !== 'Standard' && (
                        <span className="inline-block bg-blue-900/60 text-blue-300 text-xs px-1.5 py-0 rounded leading-4">
                          {item.priceLevel}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Qty — click to edit */}
                  <td className="px-2 py-2.5 text-center">
                    {editingId === item.id ? (
                      <input
                        ref={editRef}
                        type="number"
                        min="0"
                        step="1"
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        onBlur={() => commitEdit(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commitEdit(item.id) }
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="w-16 bg-gray-700 border-2 border-blue-500 rounded px-1.5 py-0.5 text-white text-center text-sm font-semibold focus:outline-none"
                      />
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); startEdit(item) }}
                        className={`w-16 py-0.5 rounded text-sm font-semibold transition-colors ${
                          selectedRow === idx
                            ? 'bg-blue-700/40 text-white hover:bg-blue-700/60'
                            : 'text-white hover:bg-gray-600'
                        }`}
                      >
                        {item.qty}
                      </button>
                    )}
                  </td>

                  {/* Unit Price */}
                  <td className="px-2 py-2.5 text-right text-gray-200 text-sm tabular-nums">
                    {fmt(item.unitPrice)}
                  </td>

                  {/* Amount */}
                  <td className="px-2 py-2.5 text-right font-bold text-white text-sm tabular-nums">
                    {fmt(item.total)}
                  </td>

                  {/* Remove */}
                  <td className="px-1.5 py-2.5 text-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); removeItem(item.id) }}
                      title="Remove item (Del)"
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-900/50 text-red-400 hover:bg-red-700 hover:text-white active:bg-red-800 transition-colors text-base font-bold leading-none"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Totals ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-gray-700 px-4 pt-3 pb-2 space-y-1.5 bg-gray-800/50">
        <div className="flex justify-between text-sm text-gray-400">
          <span>Sub Total  <span className="text-gray-600 text-xs">({items.length} items)</span></span>
          <span className="text-gray-200 tabular-nums">{fmt(subTotal)}</span>
        </div>

        {/* Discount */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400 flex-1">
            Discount <kbd className="text-gray-600 text-[10px] font-mono bg-gray-750 px-1 rounded">F6</kbd>
          </span>
          <input
            ref={discountInputRef}
            type="number"
            min="0"
            placeholder="0"
            value={discountInput}
            onChange={(e) => setDiscountInput(e.target.value)}
            onBlur={handleDiscountApply}
            onKeyDown={(e) => e.key === 'Enter' && handleDiscountApply()}
            className="w-20 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm text-right focus:outline-none focus:border-blue-500"
          />
          <select
            value={discountType}
            onChange={(e) => setDiscountType(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded px-1 py-1 text-white text-xs focus:outline-none"
          >
            <option value="amount">fixed</option>
            <option value="percent">%</option>
          </select>
          {discountAmt > 0 && (
            <span className="text-red-400 text-sm tabular-nums">− {fmt(discountAmt)}</span>
          )}
        </div>

        <div className="flex justify-between items-center border-t border-gray-600 pt-2">
          <span className="text-white font-bold">Grand Total</span>
          <span className="text-green-400 font-bold text-xl tabular-nums">{fmt(grandTotal)}</span>
        </div>
      </div>

      {/* ── Action buttons ───────────────────────────────────────── */}
      <div className="flex-shrink-0 px-3 pb-3 space-y-2">

        {/* Row 1: Draft Save + Recall side by side */}
        <div className="grid grid-cols-2 gap-2">
          {/* Draft Save (F3) — save current bill to drafts */}
          <button
            onClick={holdBill}
            disabled={items.length === 0}
            className="flex flex-col items-center justify-center bg-amber-700 hover:bg-amber-600 active:bg-amber-800 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-amber-100 rounded-xl py-2.5 px-3 transition-colors"
          >
            <span className="font-mono text-xs opacity-60 leading-none">F3</span>
            <span className="font-semibold text-sm mt-0.5">Draft Save</span>
          </button>

          {/* Recall — load a saved draft */}
          <button
            onClick={() => setShowHeld(true)}
            className="flex flex-col items-center justify-center bg-violet-700 hover:bg-violet-600 active:bg-violet-800 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-violet-100 rounded-xl py-2.5 px-3 transition-colors relative"
          >
            <span className="font-mono text-xs opacity-60 leading-none">[-]</span>
            <span className="font-semibold text-sm mt-0.5">Recall</span>
            {heldBills.length > 0 && (
              <span className="absolute top-1.5 right-2 bg-white text-violet-800 text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {heldBills.length}
              </span>
            )}
          </button>
        </div>

        {/* Row 2: New Bill + Cancel smaller */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={newBill}
            className="flex items-center justify-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg py-2 px-3 text-xs font-medium transition-colors"
          >
            <span className="font-mono opacity-50">F1</span>
            <span>New Bill</span>
          </button>
          <button
            onClick={newBill}
            className="flex items-center justify-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg py-2 px-3 text-xs font-medium transition-colors"
          >
            <span className="font-mono opacity-50">F4</span>
            <span>Cancel</span>
          </button>
        </div>

        {/* Checkout */}
        <button
          onClick={openPaymentModal}
          disabled={items.length === 0}
          className="w-full bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
        >
          {items.length > 0
            ? `[+] / F12 — Checkout  ·  ${fmt(grandTotal)}`
            : '[+] / F12 — Checkout'}
        </button>
      </div>

      {/* ── Draft bills popup ────────────────────────────────────── */}
      {showHeld && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm border border-gray-700">
            <div className="px-5 py-3.5 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-white font-semibold">Saved Drafts</h3>
              <button
                onClick={() => setShowHeld(false)}
                className="text-gray-400 hover:text-white text-xl leading-none"
              >×</button>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-gray-700">
              {heldBills.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">No saved drafts</p>
              ) : (
                heldBills.map((bill, i) => (
                  <button
                    key={bill.id}
                    onClick={() => { recallBill(bill.id); setShowHeld(false) }}
                    className="w-full text-left px-5 py-3 hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white text-sm font-semibold">
                        Draft #{i + 1} · {bill.items.length} item{bill.items.length !== 1 ? 's' : ''}
                      </span>
                      <span className="text-green-400 text-sm font-bold tabular-nums">
                        {parseFloat(bill.items.reduce((s, x) => s + x.total, 0)).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-gray-500 text-xs mt-0.5">
                      Saved at {new Date(bill.heldAt).toLocaleTimeString()}
                      {bill.customer && ` · ${bill.customer.customer_name}`}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ActionBtn({ label, shortcut, color, onClick, disabled }) {
  const colors = {
    gray:   'bg-gray-700 hover:bg-gray-600 text-gray-200',
    yellow: 'bg-yellow-700 hover:bg-yellow-600 text-yellow-100',
    purple: 'bg-purple-700 hover:bg-purple-600 text-purple-100',
    red:    'bg-red-800   hover:bg-red-700   text-red-100',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${colors[color]} disabled:opacity-40 disabled:cursor-not-allowed rounded-lg py-2 px-1 text-xs font-medium transition-colors text-center`}
    >
      <div className="font-mono text-xs opacity-60">{shortcut}</div>
      <div className="mt-0.5">{label}</div>
    </button>
  )
}
