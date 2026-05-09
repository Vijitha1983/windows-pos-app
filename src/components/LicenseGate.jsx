import { useEffect, useState } from 'react'

export default function LicenseGate({ children }) {
  const [status,    setStatus]    = useState(null)   // null | 'trial' | 'active' | 'expired'
  const [daysLeft,  setDaysLeft]  = useState(0)
  const [showForm,  setShowForm]  = useState(false)
  const [serial,    setSerial]    = useState('')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [success,   setSuccess]   = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => { loadStatus() }, [])

  async function loadStatus() {
    const result = await window.electronAPI.licenseCheck()
    setStatus(result.status)
    setDaysLeft(result.daysLeft || 0)
    if (result.status === 'expired') setShowForm(true)
  }

  async function handleActivate() {
    if (!serial.trim()) return
    setLoading(true)
    setError('')
    const result = await window.electronAPI.licenseActivate(serial.trim())
    setLoading(false)
    if (result.ok) {
      setSuccess(true)
      setTimeout(() => {
        setStatus('active')
        setShowForm(false)
        setSuccess(false)
        setDismissed(false)
      }, 1200)
    } else {
      setError(result.error)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleActivate()
  }

  // Still loading
  if (status === null) return null

  // Fully activated — render app normally
  if (status === 'active') return children

  const urgentDays = daysLeft <= 7

  return (
    <>
      {/* Trial banner — non-blocking */}
      {status === 'trial' && !dismissed && (
        <div className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-4 px-5 py-2.5 text-sm shadow-lg
          ${urgentDays ? 'bg-red-700 text-white' : 'bg-amber-600 text-white'}`}
        >
          <span>
            {urgentDays ? '⚠ ' : ''}
            Trial period: <strong>{daysLeft} day{daysLeft !== 1 ? 's' : ''}</strong> remaining.
            {urgentDays ? ' Enter a license key before your trial expires.' : ''}
          </span>
          <div className="flex gap-3 flex-shrink-0">
            <button
              onClick={() => setShowForm(true)}
              className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs font-medium transition-colors"
            >
              Enter License Key
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="text-white/60 hover:text-white text-lg leading-none px-1"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* App content — shifted down when banner is visible */}
      {status === 'trial' && (
        <div className={!dismissed ? 'pt-10' : ''}>
          {children}
        </div>
      )}

      {/* License entry modal — shown on trial (user clicked) or expired (forced) */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-6">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md p-8 space-y-6">
            {/* Header */}
            <div className="text-center space-y-1">
              {status === 'expired' ? (
                <>
                  <div className="text-red-400 text-4xl mb-2">🔒</div>
                  <h2 className="text-white text-xl font-bold">Trial Period Expired</h2>
                  <p className="text-gray-400 text-sm">Your 30-day trial has ended. Enter a license key to continue.</p>
                </>
              ) : (
                <>
                  <h2 className="text-white text-xl font-bold">Activate License</h2>
                  <p className="text-gray-400 text-sm">{daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining in your trial.</p>
                </>
              )}
            </div>

            {/* Serial input */}
            <div className="space-y-2">
              <label className="block text-gray-300 text-sm">License Key</label>
              <input
                type="text"
                value={serial}
                onChange={(e) => { setSerial(e.target.value.toUpperCase()); setError('') }}
                onKeyDown={handleKeyDown}
                placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                maxLength={24}
                autoFocus
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white font-mono text-sm tracking-widest focus:outline-none focus:border-blue-500 placeholder-gray-500"
              />
              {error && <p className="text-red-400 text-xs">{error}</p>}
              {success && <p className="text-green-400 text-xs">License activated successfully!</p>}
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleActivate}
                disabled={loading || !serial.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
              >
                {loading ? 'Verifying…' : 'Activate'}
              </button>
              {status === 'trial' && (
                <button
                  onClick={() => { setShowForm(false); setError('') }}
                  className="px-4 py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>

            <p className="text-gray-600 text-xs text-center">
              Contact your vendor to obtain a license key.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
