import { useEffect, useRef, useState } from 'react'
import { usePOSStore } from '../store/posStore'

export default function QtyModal() {
  const { qtyModal, closeQtyModal, addItemToBill } = usePOSStore()
  const [qty, setQty] = useState('1')
  const containerRef = useRef(null)
  const qtyRef       = useRef(null)

  const item      = qtyModal?.item
  const level     = qtyModal?.priceLevel
  const unitPrice = level
    ? parseFloat(level.our_price   || 0)
    : parseFloat(item?.standard_rate || 0)

  const qtyNum = Math.max(0, parseFloat(qty) || 0)
  const amount = qtyNum * unitPrice

  // Focus qty input when modal opens
  useEffect(() => {
    if (qtyModal) {
      setQty('1')
      setTimeout(() => {
        containerRef.current?.focus()   // grab keyboard away from grid
        qtyRef.current?.select()
      }, 40)
    }
  }, [qtyModal])

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeQtyModal()
    } else if (e.key === 'Enter') {
      // Only confirm if the qty input itself isn't the source
      // (the input fires its own onChange; we let Enter confirm from anywhere)
      e.preventDefault()
      e.stopPropagation()
      handleApply()
    }
  }

  function handleApply() {
    const q = parseFloat(qty)
    if (!isNaN(q) && q > 0) addItemToBill(item, level, q)
    closeQtyModal()
  }

  function adjust(delta) {
    setQty((prev) => {
      const next = Math.max(0.01, (parseFloat(prev) || 0) + delta)
      return Number.isInteger(next) ? String(next) : next.toFixed(2)
    })
  }

  if (!qtyModal) return null

  const fmt = (n) => parseFloat(n || 0).toFixed(2)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div
        ref={containerRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-600 outline-none"
      >
        {/* Item header */}
        <div className="px-6 py-4 border-b border-gray-700">
          <h2 className="text-white font-bold text-base leading-snug">{item?.item_name}</h2>
          <p className="text-gray-500 text-xs mt-0.5">{item?.item_code}</p>
          {level && (
            <span className="inline-block mt-2 bg-blue-900/60 border border-blue-700/50 text-blue-300 text-xs px-2.5 py-0.5 rounded-full font-medium">
              {level.level}
            </span>
          )}
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Unit price */}
          <div className="flex items-center justify-between bg-gray-700/40 rounded-xl px-4 py-3">
            <span className="text-gray-400 text-sm">Unit Price</span>
            <span className="text-white font-bold text-lg tabular-nums">{fmt(unitPrice)}</span>
          </div>

          {/* Qty */}
          <div>
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wide font-semibold">
              Quantity
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => adjust(-1)}
                className="w-11 h-11 flex items-center justify-center bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white rounded-xl text-2xl font-light transition-colors flex-shrink-0"
              >−</button>
              <input
                ref={qtyRef}
                type="number"
                min="0.01"
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                onKeyDown={(e) => {
                  // Let Enter bubble up to the container handler
                  if (e.key === 'Enter') return
                  // Prevent arrows from doing anything unexpected in number input
                  if (e.key === 'ArrowUp')   { e.preventDefault(); adjust(1) }
                  if (e.key === 'ArrowDown') { e.preventDefault(); adjust(-1) }
                }}
                className="flex-1 bg-gray-700 border-2 border-gray-600 focus:border-blue-500 rounded-xl px-3 py-2.5 text-white text-center text-2xl font-bold focus:outline-none tabular-nums"
              />
              <button
                onClick={() => adjust(1)}
                className="w-11 h-11 flex items-center justify-center bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white rounded-xl text-2xl font-light transition-colors flex-shrink-0"
              >+</button>
            </div>
          </div>

          {/* Amount */}
          <div className="flex items-center justify-between bg-gray-900/60 rounded-xl px-4 py-3 border border-gray-700">
            <span className="text-gray-400 text-sm">Amount</span>
            <span className="text-green-400 font-bold text-2xl tabular-nums">{fmt(amount)}</span>
          </div>
        </div>

        {/* Buttons */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={closeQtyModal}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold py-3 rounded-xl transition-colors text-sm"
          >
            Cancel <span className="opacity-40 text-xs">ESC</span>
          </button>
          <button
            onClick={handleApply}
            disabled={qtyNum <= 0}
            className="flex-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-3 rounded-xl transition-colors text-sm"
          >
            Add to Bill <span className="opacity-60 text-xs">↵</span>
          </button>
        </div>
      </div>
    </div>
  )
}
