import { useEffect, useRef, useState } from 'react'
import { usePOSStore } from '../store/posStore'
import { getTodayInvoiceSummary, closePOSSession } from '../services/api'

export default function SalesSummaryModal() {
  const {
    showSummaryModal, setShowSummaryModal,
    posProfile, posProfileData, username,
    posOpeningEntry, openingCash, sessionOpenedBy, sessionStartDate, clearPOSSession,
    setShowOpeningModal,
  } = usePOSStore()

  const [loading,  setLoading]  = useState(false)
  const [summary,  setSummary]  = useState(null)   // { invoices, totalSales, byMode, count }
  const [closing,  setClosing]  = useState(false)
  const [closeErr, setCloseErr] = useState('')
  const [closed,   setClosed]   = useState(false)  // session successfully closed
  const containerRef = useRef(null)

  useEffect(() => {
    if (showSummaryModal) {
      setClosed(false)
      setCloseErr('')
      loadSummary()
      setTimeout(() => containerRef.current?.focus(), 40)
    }
  }, [showSummaryModal])

  async function loadSummary() {
    setLoading(true)
    try {
      const data = await getTodayInvoiceSummary(posProfile, sessionStartDate)
      setSummary(data)
    } catch (err) {
      console.error('Summary fetch failed:', err)
      setSummary({ invoices: [], totalSales: 0, byMode: {}, count: 0 })
    } finally {
      setLoading(false)
    }
  }

  async function handleCloseSession() {
    if (!posOpeningEntry || !summary) return
    setClosing(true)
    setCloseErr('')
    try {
      await closePOSSession(
        posOpeningEntry,
        posProfile,
        posProfileData?.company || '',
        username,
        summary.invoices,
        summary.byMode,
        openingCash,
      )
      clearPOSSession()
      setClosed(true)
    } catch (err) {
      setCloseErr(err?.response?.data?.message || err.message || 'Failed to close session')
    } finally {
      setClosing(false)
    }
  }

  function handleClose() {
    setShowSummaryModal(false)
    // If session was just closed, prompt to open a new one
    if (closed) {
      setTimeout(() => setShowOpeningModal(true), 200)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'F5') { e.preventDefault(); handleClose() }
  }

  if (!showSummaryModal) return null

  const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Payment breakdown helpers
  const byMode     = summary?.byMode || {}
  const hasBreakdown = Object.keys(byMode).length > 0
  const cashKey    = Object.keys(byMode).find((k) => k.toLowerCase().includes('cash'))   || null
  const cardKey    = Object.keys(byMode).find((k) => k.toLowerCase().includes('card'))   || null
  const voucherKey = Object.keys(byMode).find(
    (k) => k.toLowerCase().includes('gift') || k.toLowerCase().includes('voucher')
  ) || null
  const cashSales    = cashKey    ? (byMode[cashKey]    || 0) : 0
  const cardSales    = cardKey    ? (byMode[cardKey]    || 0) : 0
  const voucherSales = voucherKey ? (byMode[voucherKey] || 0) : 0
  const otherModes = Object.entries(byMode).filter(
    ([k]) => k !== cashKey && k !== cardKey && k !== voucherKey
  )

  // Cashier figures
  const cashCollected  = cashSales
  const totalInCashier = openingCash + cashCollected

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div
        ref={containerRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-600 outline-none flex flex-col max-h-[90vh]"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-xl">Sales Summary</h2>
            <p className="text-gray-400 text-xs mt-0.5">{today}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadSummary}
              disabled={loading}
              title="Refresh"
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-40"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* ── Session closed banner ── */}
          {closed && (
            <div className="bg-green-900/30 border border-green-700 rounded-xl px-5 py-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-green-300 font-semibold text-sm">POS Session Closed</p>
                <p className="text-green-400/70 text-xs">Closing entry submitted to ERPNext</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <svg className="w-8 h-8 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              <span className="text-gray-400 text-sm">Loading today's data…</span>
            </div>
          ) : summary && (
            <>
              {/* ══ DAY SALES SUMMARY ══ */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-5 rounded-full bg-blue-500" />
                  <h3 className="text-white font-bold text-sm uppercase tracking-wider">Day Sales Summary</h3>
                  <span className="ml-auto text-xs text-gray-500">{summary.count} invoice{summary.count !== 1 ? 's' : ''}</span>
                </div>

                <div className="bg-gray-900/50 rounded-xl border border-gray-700 overflow-hidden">
                  {/* Total Sales */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/60">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <span className="text-gray-300 text-sm font-medium">Total Sales</span>
                    </div>
                    <span className="text-white font-bold text-xl tabular-nums">{fmt(summary.totalSales)}</span>
                  </div>

                  {/* Cash Sales */}
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-700/40">
                    <div className="flex items-center gap-2.5 pl-4">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-gray-400 text-sm">
                        Cash Sales
                        {hasBreakdown && summary.totalSales > 0 && cashSales > 0 && (
                          <span className="ml-2 text-gray-600 text-xs">
                            ({((cashSales / summary.totalSales) * 100).toFixed(0)}%)
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="font-semibold tabular-nums text-sm">
                      {hasBreakdown
                        ? <span className="text-green-400">{fmt(cashSales)}</span>
                        : <span className="text-gray-600 text-xs">—</span>}
                    </span>
                  </div>

                  {/* Card Sales */}
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-700/40">
                    <div className="flex items-center gap-2.5 pl-4">
                      <div className="w-2 h-2 rounded-full bg-blue-400" />
                      <span className="text-gray-400 text-sm">
                        Card Sales
                        {hasBreakdown && summary.totalSales > 0 && cardSales > 0 && (
                          <span className="ml-2 text-gray-600 text-xs">
                            ({((cardSales / summary.totalSales) * 100).toFixed(0)}%)
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="font-semibold tabular-nums text-sm">
                      {hasBreakdown
                        ? <span className="text-blue-400">{fmt(cardSales)}</span>
                        : <span className="text-gray-600 text-xs">—</span>}
                    </span>
                  </div>

                  {/* Gift Voucher Sales */}
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-700/40">
                    <div className="flex items-center gap-2.5 pl-4">
                      <div className="w-2 h-2 rounded-full bg-purple-400" />
                      <span className="text-gray-400 text-sm">
                        Gift Voucher
                        {hasBreakdown && summary.totalSales > 0 && voucherSales > 0 && (
                          <span className="ml-2 text-gray-600 text-xs">
                            ({((voucherSales / summary.totalSales) * 100).toFixed(0)}%)
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="font-semibold tabular-nums text-sm">
                      {hasBreakdown
                        ? <span className="text-purple-400">{fmt(voucherSales)}</span>
                        : <span className="text-gray-600 text-xs">—</span>}
                    </span>
                  </div>

                  {/* Other payment modes (anything not cash/card/voucher) */}
                  {otherModes.map(([mode, amount]) => (
                    <div key={mode} className="flex items-center justify-between px-5 py-3.5 border-b border-gray-700/40 last:border-b-0">
                      <div className="flex items-center gap-2.5 pl-4">
                        <div className="w-2 h-2 rounded-full bg-amber-400" />
                        <span className="text-gray-400 text-sm">{mode}</span>
                      </div>
                      <span className="text-amber-400 font-semibold tabular-nums text-sm">{fmt(amount)}</span>
                    </div>
                  ))}

                  {/* No breakdown fallback */}
                  {!hasBreakdown && summary.count > 0 && (
                    <div className="px-5 py-3 text-center text-gray-600 text-xs">
                      Payment breakdown unavailable
                    </div>
                  )}

                  {summary.count === 0 && (
                    <div className="px-5 py-6 text-center text-gray-500 text-sm">No invoices today</div>
                  )}
                </div>
              </section>

              {/* ══ CASHIER SUMMARY ══ */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-5 rounded-full bg-amber-500" />
                  <h3 className="text-white font-bold text-sm uppercase tracking-wider">Cashier Summary</h3>
                  <div className="ml-auto flex flex-col items-end">
                    <span className="text-xs text-gray-300">{username}</span>
                    {sessionOpenedBy && sessionOpenedBy !== username && (
                      <span className="text-[10px] text-amber-400">Session opened by {sessionOpenedBy}</span>
                    )}
                  </div>
                </div>

                <div className="bg-gray-900/50 rounded-xl border border-gray-700 overflow-hidden">
                  {/* Opening Cash */}
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-700/60">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-amber-600/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-gray-300 text-sm font-medium">Opening Cash</p>
                        {posOpeningEntry && (
                          <p className="text-gray-600 text-xs">{posOpeningEntry}</p>
                        )}
                      </div>
                    </div>
                    <span className={`font-semibold tabular-nums ${posOpeningEntry ? 'text-amber-400' : 'text-gray-600 text-sm'}`}>
                      {posOpeningEntry ? fmt(openingCash) : 'No session'}
                    </span>
                  </div>

                  {/* Day Cash Collected */}
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-700/60">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-green-600/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <p className="text-gray-300 text-sm font-medium">Day Cash Collected</p>
                    </div>
                    <span className="font-semibold tabular-nums">
                      {hasBreakdown
                        ? <span className="text-green-400">{fmt(cashCollected)}</span>
                        : <span className="text-gray-600 text-sm">—</span>}
                    </span>
                  </div>

                  {/* Total Cash in Cashier — highlighted */}
                  <div className="flex items-center justify-between px-5 py-4 bg-amber-900/20">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                      </div>
                      <p className="text-amber-200 text-sm font-bold">Total Cash in Cashier</p>
                    </div>
                    <span className="text-amber-300 font-bold text-xl tabular-nums">{fmt(totalInCashier)}</span>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* Close session error */}
          {closeErr && (
            <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-2.5 text-red-300 text-sm break-words">
              {closeErr}
            </div>
          )}
        </div>

        {/* ── Footer buttons ── */}
        <div className="px-6 pb-5 pt-3 border-t border-gray-700 flex gap-3 flex-shrink-0">
          {posOpeningEntry && !closed && (
            <button
              type="button"
              onClick={handleCloseSession}
              disabled={closing || loading || !summary}
              className="flex-1 bg-red-700 hover:bg-red-600 active:bg-red-800 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-3 rounded-xl transition-colors text-sm"
            >
              {closing ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Closing…
                </span>
              ) : 'Close POS Session'}
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold py-3 rounded-xl transition-colors text-sm"
          >
            {closed ? 'Done — Open New Session' : 'Close'}
            <span className="ml-2 text-xs opacity-40">ESC</span>
          </button>
        </div>
      </div>
    </div>
  )
}
