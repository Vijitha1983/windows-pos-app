import { useEffect, useRef, useState } from 'react'
import { authenticate, signOut } from '../services/auth'
import { getPOSProfiles, getPOSProfile, getUserFullName, setBaseURL } from '../services/api'
import { usePOSStore } from '../store/posStore'

export default function Login() {
  const [url, setUrl] = useState('https://')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState('credentials') // 'credentials' | 'profile'
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [companyName, setCompanyName] = useState('')

  const store = usePOSStore()
  const isLocked = store.isLoggedIn && !!store.username  // came from Ctrl+L lock, not fresh boot

  const lockPasswordRef = useRef(null)
  useEffect(() => {
    if (isLocked) setTimeout(() => lockPasswordRef.current?.focus(), 80)
  }, [isLocked])

  // ── Unlock (locked state) ─────────────────────────────────────────────────
  const [lockPassword, setLockPassword] = useState('')
  const [lockError,    setLockError]    = useState('')

  async function handleUnlock(e) {
    e.preventDefault()
    setLockError('')
    setLoading(true)
    try {
      await authenticate(store.erpnextUrl, store.username, lockPassword)
      setLockPassword('')
      store.setCurrentScreen('pos')
    } catch (err) {
      setLockError(err.response?.data?.message || err.message || 'Incorrect password')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authenticate(url.trim(), username.trim(), password)
      const profileList = await getPOSProfiles()
      if (profileList.length === 0) throw new Error('No POS Profiles found for this user.')
      setProfiles(profileList)
      setCompanyName(profileList[0]?.company || '')
      store.setUsername(username.trim())
      store.setErpnextUrl(url.trim())
      // Fetch display name (first + last name) — fall back to username if unavailable
      try {
        const fullName = await getUserFullName(username.trim())
        store.setUserFullName(fullName)
      } catch {
        store.setUserFullName(username.trim())
      }
      setStep('profile')
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleProfileSelect(profile) {
    setLoading(true)
    setError('')
    try {
      const profileData = await getPOSProfile(profile.name)
      store.setPosProfile(profile.name)
      store.setPosProfileData(profileData)
      await window.electronAPI.storeSet('posProfile', profile.name)
      store.setLoggedIn(true)
      store.setCurrentScreen('pos')
    } catch (err) {
      setError(err.message || 'Failed to load POS profile')
    } finally {
      setLoading(false)
    }
  }

  // ── Locked screen ─────────────────────────────────────────────────────────
  if (isLocked) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-800 border-2 border-gray-600 rounded-2xl mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-white">
              {store.posProfileData?.company || 'POS'} — Locked
            </h1>
            <p className="text-gray-500 text-sm mt-1">Enter your password to resume</p>
          </div>

          <div className="bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <form onSubmit={handleUnlock} className="p-6 space-y-4">
              {/* Cashier name — read only */}
              <div className="flex items-center gap-3 bg-gray-700/50 rounded-lg px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-bold uppercase">
                    {(store.userFullName || store.username)?.[0] || '?'}
                  </span>
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{store.userFullName || store.username}</p>
                  <p className="text-gray-500 text-xs">{store.posProfile}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Password</label>
                <input
                  ref={lockPasswordRef}
                  type="password"
                  value={lockPassword}
                  onChange={(e) => setLockPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {lockError && (
                <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-2.5 text-red-300 text-sm">
                  {lockError}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {loading ? 'Unlocking…' : 'Unlock POS'}
              </button>
            </form>

            <div className="px-6 pb-5 text-center">
              <button
                onClick={async () => {
                  await signOut()
                  store.setLoggedIn(false)
                  store.setUsername('')
                }}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                Sign out instead
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">
            Orbis POS
          </h1>
          <p className="text-gray-400 text-sm mt-1">{companyName || 'Point of Sale Terminal'}</p>
        </div>

        <div className="bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
          {step === 'credentials' ? (
            <form onSubmit={handleLogin} className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-white mb-4">Sign In</h2>

              <div>
                <label className="block text-sm text-gray-400 mb-1">ERPNext URL</label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://yoursite.erpnext.com"
                  required
                  autoFocus
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {error && (
                <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-2.5 text-red-300 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors mt-2"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          ) : (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Select POS Profile</h2>
              {error && (
                <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-2 text-red-300 text-sm mb-4">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                {profiles.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => handleProfileSelect(p)}
                    disabled={loading}
                    className="w-full text-left bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-blue-500 rounded-lg px-4 py-3 text-white transition-colors"
                  >
                    <div className="font-medium">{p.name}</div>
                    {p.company && <div className="text-sm text-gray-400">{p.company}</div>}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setStep('credentials')}
                className="mt-4 text-sm text-gray-400 hover:text-white transition-colors"
              >
                ← Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
