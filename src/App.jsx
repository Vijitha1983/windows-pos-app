import { useEffect } from 'react'
import { usePOSStore } from './store/posStore'
import { restoreSession } from './services/auth'
import { getPOSProfile } from './services/api'
import { getQueuedInvoices, removeQueuedInvoice } from './services/cache'
import { submitPOSInvoice } from './services/api'
import Login from './components/Login'
import POSMain from './components/POSMain'
import LicenseGate from './components/LicenseGate'

function WindowControls() {
  return (
    <div
      className="fixed top-0 left-0 right-0 h-8 z-[9999] flex items-center select-none"
      style={{ WebkitAppRegion: 'drag' }}
    >
      <div className="ml-auto flex" style={{ WebkitAppRegion: 'no-drag' }}>
        {/* Minimize */}
        <button
          onClick={() => window.electronAPI.minimize()}
          title="Minimize"
          className="w-11 h-8 flex items-center justify-center text-gray-500 hover:bg-white/10 hover:text-white transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        {/* Maximize / Restore Down */}
        <button
          onClick={() => window.electronAPI.maximize()}
          title="Maximize / Restore Down"
          className="w-11 h-8 flex items-center justify-center text-gray-500 hover:bg-white/10 hover:text-white transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0.75" y="0.75" width="8.5" height="8.5" fill="none" stroke="currentColor" strokeWidth="1.3" rx="0.3"/>
          </svg>
        </button>
        {/* Close */}
        <button
          onClick={() => window.electronAPI.close()}
          title="Close"
          className="w-11 h-8 flex items-center justify-center text-gray-500 hover:bg-red-600 hover:text-white transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const store = usePOSStore()

  useEffect(() => {
    store.setTheme(store.theme)

    async function tryRestore() {
      try {
        const session = await restoreSession()
        if (!session) { store.setCurrentScreen('login'); return }

        store.setUsername(session.user)
        store.setErpnextUrl(session.url)

        const [posProfileName, showImages] = await Promise.all([
          window.electronAPI.storeGet('posProfile'),
          window.electronAPI.storeGet('showImages'),
        ])

        if (showImages !== undefined) store.setShowImages(!!showImages)

        if (posProfileName) {
          // Load full profile data so payment methods are available immediately
          const profileData = await getPOSProfile(posProfileName)
          store.setPosProfile(posProfileName)
          store.setPosProfileData(profileData)
          store.setLoggedIn(true)
          store.setCurrentScreen('pos')
        } else {
          store.setCurrentScreen('login')
        }
      } catch {
        store.setCurrentScreen('login')
      }
    }
    tryRestore()

    const handler = () => { store.setLoggedIn(false); store.setCurrentScreen('login') }
    window.addEventListener('auth:expired', handler)
    return () => window.removeEventListener('auth:expired', handler)
  }, [])

  // Sync offline queue whenever we come back online
  useEffect(() => {
    async function syncQueue() {
      if (!store.isOnline) return
      const queue = await getQueuedInvoices()
      if (queue.length === 0) return
      console.log(`Syncing ${queue.length} offline invoice(s)…`)
      // Process newest first so we don't leave partial states
      for (let i = queue.length - 1; i >= 0; i--) {
        try {
          await submitPOSInvoice(queue[i].invoice)
          await removeQueuedInvoice(i)
        } catch (err) {
          console.error('Offline sync failed for invoice', i, err.message)
        }
      }
    }

    if (store.isOnline && store.isLoggedIn) syncQueue()
  }, [store.isOnline, store.isLoggedIn])

  const screen = store.currentScreen === 'pos' ? <POSMain /> : <Login />
  return (
    <>
      <WindowControls />
      <LicenseGate>{screen}</LicenseGate>
    </>
  )
}
