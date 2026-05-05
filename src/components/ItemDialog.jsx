import { useEffect, useRef, useState } from 'react'
import { usePOSStore } from '../store/posStore'
import { getAvailableSerialNos } from '../services/api'

function SerialNoInput({ serialNo, setSerialNo, availableSerials, serialsLoading }) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [dropIdx, setDropIdx] = useState(0)
  const textareaRef = useRef(null)

  const addedSerials = new Set(serialNo.split('\n').map((s) => s.trim()).filter(Boolean))

  // Extract what's being typed on the current (last) line
  const lines = serialNo.split('\n')
  const currentLine = lines[lines.length - 1].trim()

  const suggestions = currentLine.length === 0 ? [] : availableSerials.filter(
    (sn) => !addedSerials.has(sn) && sn.toLowerCase().includes(currentLine.toLowerCase())
  ).slice(0, 8)

  useEffect(() => {
    setDropIdx(0)
    setDropdownOpen(suggestions.length > 0)
  }, [currentLine, serialNo])

  function pickSuggestion(sn) {
    setSerialNo((prev) => {
      const parts = prev.split('\n')
      parts[parts.length - 1] = sn
      return parts.join('\n') + '\n'
    })
    setDropdownOpen(false)
    setTimeout(() => {
      const ta = textareaRef.current
      if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length }
    }, 10)
  }

  function handleKeyDown(e) {
    if (dropdownOpen && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setDropIdx((i) => Math.min(i + 1, suggestions.length - 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); e.stopPropagation(); setDropIdx((i) => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); pickSuggestion(suggestions[dropIdx]); return }
      if (e.key === 'Escape')    { e.preventDefault(); e.stopPropagation(); setDropdownOpen(false); return }
    }
    e.stopPropagation()
  }

  return (
    <div className="flex-1 relative">
      <label className="block text-xs text-amber-400 font-medium mb-1">
        Serial No
        {serialsLoading && <span className="ml-2 text-gray-500 font-normal">loading…</span>}
        {!serialsLoading && availableSerials.length > 0 && (
          <span className="ml-2 text-gray-500 font-normal">({availableSerials.length - addedSerials.size} available · type to search)</span>
        )}
      </label>
      <textarea
        ref={textareaRef}
        value={serialNo}
        onChange={(e) => setSerialNo(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
        rows={2}
        placeholder={"Type to search serial…"}
        className="w-full bg-gray-700 border border-amber-700/50 focus:border-amber-500 rounded-lg px-3 py-1.5 text-white text-xs font-mono placeholder-gray-600 focus:outline-none resize-none"
      />
      {dropdownOpen && (
        <div className="absolute z-10 left-0 right-0 bg-gray-900 border border-amber-700/60 rounded-lg shadow-xl overflow-hidden">
          {suggestions.map((sn, i) => (
            <button
              key={sn}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pickSuggestion(sn) }}
              className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors ${
                i === dropIdx ? 'bg-amber-800/60 text-amber-200' : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              {sn}
            </button>
          ))}
        </div>
      )}
      {addedSerials.size > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {[...addedSerials].map((sn) => (
            <span key={sn} className="px-2 py-0.5 bg-green-900/40 border border-green-700 text-green-400 rounded text-xs font-mono">{sn}</span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ItemDialog() {
  const { itemDialog, closeItemDialog, addItemToBill, posProfileData } = usePOSStore()

  const item   = itemDialog?.item
  const levels = itemDialog?.levels || []

  // Build a flat row for every price level (or one Standard row if none)
  function buildRows() {
    if (!item) return []
    if (levels.length === 0) {
      return [{
        label:       'Standard',
        uom:         item.stock_uom || 'Nos',
        markedPrice: parseFloat(item.standard_rate || 0),
        discount:    0,
      }]
    }
    return levels.map((l) => ({
      label:       l.level,
      uom:         item.stock_uom || 'Nos',
      markedPrice: parseFloat(l.marked_price || 0),
      discount:    parseFloat(l.discount_amount || 0),
    }))
  }

  const [rows,            setRows]           = useState([])
  const [selectedIdx,     setIdx]            = useState(0)
  const [qty,             setQty]            = useState('1')
  const [serialNo,        setSerialNo]       = useState('')
  const [batchNo,         setBatchNo]        = useState('')
  const [availableSerials, setAvailableSerials] = useState([])
  const [serialsLoading,   setSerialsLoading]   = useState(false)

  const containerRef = useRef(null)
  const qtyRef       = useRef(null)
  const discountRefs = useRef([])

  // Re-initialise whenever the dialog opens
  useEffect(() => {
    if (itemDialog) {
      const r = buildRows()
      setRows(r)
      setIdx(0)
      setQty('1')
      setSerialNo('')
      setBatchNo('')
      setAvailableSerials([])
      discountRefs.current = []
      setTimeout(() => {
        containerRef.current?.focus()
        qtyRef.current?.select()
      }, 40)

      if (itemDialog.item?.has_serial_no) {
        setSerialsLoading(true)
        getAvailableSerialNos(itemDialog.item.item_code, posProfileData?.warehouse)
          .then((serials) => setAvailableSerials(serials))
          .catch(() => {})
          .finally(() => setSerialsLoading(false))
      }
    }
  }, [itemDialog])

  // Keep qty input focused when selected row changes
  useEffect(() => {
    setTimeout(() => qtyRef.current?.select(), 30)
  }, [selectedIdx])

  // ── Derived values for selected row ─────────────────────────────────────
  const row      = rows[selectedIdx]
  const ourPrice = row ? Math.max(0, row.markedPrice - row.discount) : 0
  const qtyNum   = Math.max(0, parseFloat(qty) || 0)
  const amount   = parseFloat((qtyNum * ourPrice).toFixed(2))

  // ── Handlers ─────────────────────────────────────────────────────────────
  function selectRow(idx) {
    setIdx(idx)
  }

  function updateDiscount(idx, raw) {
    const val = Math.max(0, parseFloat(raw) || 0)
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, discount: val } : r))
  }

  function handleAdd() {
    if (qtyNum <= 0 || !row) return
    const effectiveLevel = {
      level:           row.label,
      our_price:       ourPrice,
      marked_price:    row.markedPrice,
      discount_amount: row.discount,
    }
    addItemToBill(item, effectiveLevel, qtyNum, serialNo.trim(), batchNo.trim())
    closeItemDialog()
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeItemDialog(); return }
    if (e.key === 'Enter')  { e.preventDefault(); e.stopPropagation(); handleAdd(); return }
    // Arrow keys navigate rows from anywhere inside the dialog
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, rows.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
  }

  if (!itemDialog) return null

  const fmt = (n) => parseFloat(n || 0).toFixed(2)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div
        ref={containerRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl border border-gray-600 outline-none"
      >
        {/* ── Header ── */}
        <div className="px-6 py-4 border-b border-gray-700 flex items-start justify-between">
          <div>
            <h2 className="text-white font-bold text-lg leading-tight">{item?.item_name}</h2>
            <p className="text-gray-500 text-xs mt-0.5">{item?.item_code}</p>
          </div>
          <button
            type="button"
            onClick={closeItemDialog}
            className="text-gray-500 hover:text-white text-2xl leading-none px-1 ml-4 flex-shrink-0"
          >×</button>
        </div>

        {/* ── Table ── */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-900/60 border-b border-gray-700">
                <th className="px-5 py-3 text-left   text-xs font-semibold text-gray-400 uppercase tracking-wide">Level</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide w-16">UOM</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide w-28">QTY</th>
                <th className="px-5 py-3 text-right  text-xs font-semibold text-gray-400 uppercase tracking-wide">Unit Price / Marked Price</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide w-32">Discount</th>
                <th className="px-5 py-3 text-right  text-xs font-semibold text-gray-400 uppercase tracking-wide">Amount / Our Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {rows.map((r, idx) => {
                const active   = idx === selectedIdx
                const rowPrice = Math.max(0, r.markedPrice - r.discount)

                return (
                  <tr
                    key={idx}
                    onClick={() => selectRow(idx)}
                    className={`cursor-pointer transition-colors ${
                      active
                        ? 'bg-blue-900/25 border-l-2 border-l-blue-500'
                        : 'hover:bg-gray-700/25 border-l-2 border-l-transparent'
                    }`}
                  >
                    {/* Level */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 transition-colors ${
                          active ? 'border-blue-400 bg-blue-400' : 'border-gray-600'
                        }`} />
                        <span className={`font-semibold ${active ? 'text-white' : 'text-gray-300'}`}>
                          {r.label}
                        </span>
                      </div>
                    </td>

                    {/* UOM */}
                    <td className="px-3 py-3.5 text-center text-gray-400 text-sm">{r.uom}</td>

                    {/* QTY — editable only on selected row */}
                    <td className="px-3 py-3.5 text-center">
                      {active ? (
                        <input
                          ref={qtyRef}
                          type="number"
                          min="0.01"
                          step="1"
                          value={qty}
                          onChange={(e) => setQty(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            // Tab → jump to this row's discount input
                            if (e.key === 'Tab') {
                              e.preventDefault(); e.stopPropagation()
                              discountRefs.current[idx]?.focus()
                              discountRefs.current[idx]?.select()
                              return
                            }
                            // ArrowUp/Down → prevent the number-spin default but let
                            // the event bubble so the container can change the selected row
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault()
                          }}
                          className="w-20 bg-gray-700 border-2 border-blue-500 rounded-lg px-2 py-1.5 text-white text-center text-base font-bold focus:outline-none tabular-nums"
                        />
                      ) : (
                        <span className="text-gray-600 text-sm">—</span>
                      )}
                    </td>

                    {/* Marked Price */}
                    <td className="px-5 py-3.5 text-right tabular-nums text-gray-200 font-medium">
                      {fmt(r.markedPrice)}
                    </td>

                    {/* Discount — editable on any row */}
                    <td className="px-3 py-3.5 text-center">
                      <input
                        ref={(el) => (discountRefs.current[idx] = el)}
                        type="number"
                        min="0"
                        step="0.01"
                        value={r.discount === 0 ? '' : r.discount}
                        placeholder="0"
                        onChange={(e) => { updateDiscount(idx, e.target.value) }}
                        onClick={(e) => { e.stopPropagation(); selectRow(idx) }}
                        onKeyDown={(e) => {
                          // Enter/Escape bubble to container (confirm / cancel)
                          if (e.key === 'Enter' || e.key === 'Escape') return
                          // Tab → move to QTY of the next row (wrap to first if last)
                          if (e.key === 'Tab') {
                            e.preventDefault(); e.stopPropagation()
                            const next = (idx + 1) % rows.length
                            setIdx(next)
                            // qtyRef updates via useEffect on selectedIdx change
                            return
                          }
                          // ArrowUp/Down → prevent number-spin, let bubble for row nav
                          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); return }
                          e.stopPropagation()
                        }}
                        className={`w-24 rounded-lg px-2 py-1.5 text-center text-sm focus:outline-none tabular-nums transition-colors ${
                          active
                            ? 'bg-gray-700 border-2 border-amber-500 text-amber-200 focus:border-amber-400'
                            : 'bg-gray-700/50 border border-gray-600 text-gray-400 hover:border-gray-500'
                        }`}
                      />
                    </td>

                    {/* Our Price */}
                    <td className="px-5 py-3.5 text-right">
                      <span className={`font-bold tabular-nums ${
                        active ? 'text-green-400 text-base' : 'text-gray-300 text-sm'
                      }`}>
                        {fmt(rowPrice)}
                      </span>
                      {r.discount > 0 && (
                        <div className="text-xs text-red-400 tabular-nums">
                          − {fmt(r.discount)}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Serial No / Batch No (only for tracked items) ── */}
        {(item?.has_serial_no || item?.has_batch_no) && (
          <div className="px-6 py-3 border-t border-gray-700 flex gap-4">
            {item?.has_serial_no ? (
              <SerialNoInput
                serialNo={serialNo}
                setSerialNo={setSerialNo}
                availableSerials={availableSerials}
                serialsLoading={serialsLoading}
              />
            ) : null}
            {item?.has_batch_no ? (
              <div className="flex-1">
                <label className="block text-xs text-amber-400 font-medium mb-1">
                  Batch No <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={batchNo}
                  onChange={(e) => setBatchNo(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="BATCH-001"
                  className="w-full bg-gray-700 border border-amber-700/50 focus:border-amber-500 rounded-lg px-3 py-1.5 text-white text-xs font-mono placeholder-gray-600 focus:outline-none"
                />
              </div>
            ) : null}
          </div>
        )}

        {/* ── Footer: Amount + Buttons ── */}
        <div className="px-6 py-4 border-t border-gray-700 flex items-center justify-between gap-4">
          {/* Amount */}
          <div className="flex-shrink-0">
            <p className="text-gray-500 text-xs mb-0.5 uppercase tracking-wide">Amount</p>
            <p className="text-green-400 font-bold text-2xl tabular-nums">{fmt(amount)}</p>
            {qtyNum > 1 && row && (
              <p className="text-gray-600 text-xs tabular-nums">
                {fmt(qtyNum)} × {fmt(ourPrice)}
              </p>
            )}
          </div>

          {/* Hint */}
          <p className="text-gray-600 text-xs text-center flex-1">
            ↑↓ select level · Tab switches to discount · Enter adds to bill
          </p>

          {/* Buttons */}
          <div className="flex gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={closeItemDialog}
              className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl font-medium transition-colors text-sm"
            >
              Cancel <span className="opacity-40 text-xs">ESC</span>
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={qtyNum <= 0}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded-xl transition-colors"
            >
              Add to Bill <span className="opacity-60 text-xs ml-1">↵</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
