import { useEffect } from 'react'
import { usePOSStore } from './store/posStore'
import { restoreSession } from './services/auth'
import { getPOSProfile } from './services/api'
import { getQueuedInvoices, removeQueuedInvoice } from './services/cache'
import { submitPOSInvoice } from './services/api'
import Login from './components/Login'
import POSMain from './components/POSMain'
import LicenseGate from './components/LicenseGate'

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
  return <LicenseGate>{screen}</LicenseGate>
}
