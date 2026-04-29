import { useEffect, useRef, useState } from 'react'
import { usePOSStore } from '../store/posStore'

export default function PriceLevelModal() {
  const { priceLevelModal, closePriceLevelModal, openQtyModal } = usePOSStore()
  const [selectedIdx, setSelectedIdx] = useState(0)
  const containerRef = useRef(null)
  const rowRefs      = useRef([])

  const item   = priceLevelModal?.item
  const levels = priceLevelModal?.priceLevels || []

  // Focus the modal container when it opens so keyboard events
  // don't reach the still-focused item grid button behind it.
  useEffect(() => {
    if (priceLevelModal) {
      setSelectedIdx(0)
      rowRefs.current = []
      setTimeout(() => containerRef.current?.focus(), 30)
    }
  }, [priceLevelModal])

  // Scroll the highlighted row into view
  useEffect(() => {
    rowRefs.current[selectedIdx]?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  // Handle keys on the container div (not window), so background
  // handlers — item grid, bill table — never see these key events.
  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, levels.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()          // prevent the grid button's click from firing
      const level = levels[selectedIdx]
      if (level) {
        closePriceLevelModal()
        openQtyModal(item, level)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closePriceLevelModal()
    }
  }

  if (!priceLevelModal) return null

  const fmt = (n) => parseFloat(n || 0).toFixed(2)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      {/* outline-none so focus ring doesn't show on the outer wrapper */}
      <div
        ref={containerRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xl border border-gray-600 outline-none"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-white font-bold text-lg leading-tight">Select Price Level</h2>
              <p className="text-blue-300 text-sm mt-0.5 font-medium">{item?.item_name}</p>
              <p className="text-gray-500 text-xs">{item?.item_code}</p>
            </div>
            <button
              onClick={closePriceLevelModal}
              className="text-gray-500 hover:text-white transition-colors text-2xl leading-none px-1"
            >×</button>
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-4 px-6 py-2 bg-gray-900/40 border-b border-gray-700">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Level</span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Marked Price</span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Discount</span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Our Price</span>
        </div>

        {/* Price level rows */}
        <div className="max-h-80 overflow-y-auto divide-y divide-gray-700/60">
          {levels.map((lvl, i) => {
            const active = i === selectedIdx
            return (
              <button
                key={i}
                ref={(el) => (rowRefs.current[i] = el)}
                onClick={() => {
                  closePriceLevelModal()
                  openQtyModal(item, lvl)
                }}
                onMouseEnter={() => setSelectedIdx(i)}
                className={`w-full grid grid-cols-4 items-center px-6 py-4 text-left transition-all ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-200 hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${active ? 'bg-white' : 'bg-gray-600'}`} />
                  <span className="font-semibold text-sm">{lvl.level}</span>
                </div>

                <span className={`text-right text-sm tabular-nums ${active ? 'text-blue-100' : 'text-gray-300'}`}>
                  {fmt(lvl.marked_price)}
                </span>

                <span className={`text-right text-sm tabular-nums font-medium ${active ? 'text-red-200' : 'text-red-400'}`}>
                  − {fmt(lvl.discount_amount)}
                </span>

                <div className="text-right">
                  <span className={`text-base font-bold tabular-nums ${active ? 'text-white' : 'text-green-400'}`}>
                    {fmt(lvl.our_price)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-700 bg-gray-900/30 rounded-b-2xl flex items-center justify-between">
          <span className="text-xs text-gray-500">↑ ↓ Navigate · Enter select · ESC cancel</span>
          <span className="text-xs text-gray-500">{levels.length} level{levels.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  )
}
