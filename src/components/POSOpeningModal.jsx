import { useEffect, useRef, useState } from 'react'
import { usePOSStore } from '../store/posStore'
import { createPOSOpeningEntry, getOpenPOSSession } from '../services/api'

export default function POSOpeningModal() {
  const {
    showOpeningModal, setShowOpeningModal,
    posProfile, posProfileData, username,
    setPosOpeningEntry,
  } = usePOSStore()

  const [openingCash, setOpeningCash] = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const inputRef  = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    if (showOpeningModal) {
      setOpeningCash('')
      setError('')
      setTimeout(() => { containerRef.current?.focus(); inputRef.current?.select() }, 50)
    }
  }, [showOpeningModal])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !loading) { e.preventDefault(); handleOpen() }
    if (e.key === 'Escape')            { e.preventDefault(); handleSkip() }
  }

  async function handleOpen() {
    setLoading(true)
    setError('')
    try {
      const cash = parseFloat(openingCash) || 0

      // Check first — a previous attempt may have succeeded on the server but
      // timed out before the response arrived. Reuse it instead of creating a duplicate.
      let existing = null
      try { existing = await getOpenPOSSession(posProfile) } catch {}

      let entry = existing
      if (!entry) {
        const methods = (posProfileData?.payments || []).map((p) => p.mode_of_payment)
        if (!methods.some((m) => m.toLowerCase().includes('cash'))) methods.unshift('Cash')
        entry = await createPOSOpeningEntry(
          posProfile,
          posProfileData?.company || '',
          username,
          methods,
          cash,
        )
      }

      const sessionCash = existing
        ? (existing.balance_details || []).find((b) => b.mode_of_payment?.toLowerCase().includes('cash'))?.opening_amount ?? cash
        : cash

      setPosOpeningEntry(entry.name, sessionCash, username, entry.period_start_date)
      setShowOpeningModal(false)
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to create opening entry')
    } finally {
      setLoading(false)
    }
  }

  function handleSkip() {
    setShowOpeningModal(false)
  }

  if (!showOpeningModal) return null

  const fmt = (n) => parseFloat(n || 0).toFixed(2)

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div
        ref={containerRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-600 outline-none"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-700">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h2 className="text-white font-bold text-lg leading-tight">Open POS Session</h2>
              <p className="text-gray-400 text-xs">{posProfile}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Opening cash input */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Opening Cash in Drawer
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm pointer-events-none">
                {posProfileData?.currency || 'LKR'}
              </span>
              <input
                ref={inputRef}
                type="number"
                min="0"
                step="0.01"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="0.00"
                className="w-full bg-gray-700 border-2 border-gray-600 focus:border-blue-500 rounded-xl pl-16 pr-4 py-3 text-white text-right text-xl font-bold focus:outline-none tabular-nums"
              />
            </div>
            <p className="text-gray-500 text-xs mt-1.5 text-right">
              Count the cash in the drawer before opening
            </p>
          </div>

          {/* Info row */}
          <div className="bg-gray-700/40 rounded-xl px-4 py-3 flex items-center justify-between text-sm">
            <span className="text-gray-400">Cashier</span>
            <span className="text-white font-medium">{username}</span>
          </div>
          <div className="bg-gray-700/40 rounded-xl px-4 py-3 flex items-center justify-between text-sm">
            <span className="text-gray-400">Date</span>
            <span className="text-white font-medium">
              {new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </span>
          </div>

          {error && (
            <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-2.5 text-red-300 text-sm break-words">
              {error}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="px-6 pb-5 space-y-2">
          <button
            type="button"
            onClick={handleOpen}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-3.5 rounded-xl transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Opening Session…
              </span>
            ) : (
              <>Open POS Session <span className="opacity-50 text-sm">↵</span></>
            )}
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={loading}
            className="w-full bg-transparent text-gray-500 hover:text-gray-300 py-2 text-sm transition-colors"
          >
            Skip (continue without session)
          </button>
        </div>
      </div>
    </div>
  )
}
