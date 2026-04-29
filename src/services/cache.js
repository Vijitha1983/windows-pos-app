const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

const memCache = new Map()

export function cacheSet(key, data) {
  memCache.set(key, { data, ts: Date.now() })
}

export function cacheGet(key) {
  const entry = memCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL) {
    memCache.delete(key)
    return null
  }
  return entry.data
}

export function cacheClear(prefix) {
  if (!prefix) {
    memCache.clear()
    return
  }
  for (const key of memCache.keys()) {
    if (key.startsWith(prefix)) memCache.delete(key)
  }
}

// Offline invoice queue (persisted via electron-store)
export async function queueInvoice(invoice) {
  const queue = (await window.electronAPI.storeGet('offlineQueue')) || []
  queue.push({ invoice, ts: Date.now() })
  await window.electronAPI.storeSet('offlineQueue', queue)
}

export async function getQueuedInvoices() {
  return (await window.electronAPI.storeGet('offlineQueue')) || []
}

export async function removeQueuedInvoice(index) {
  const queue = (await window.electronAPI.storeGet('offlineQueue')) || []
  queue.splice(index, 1)
  await window.electronAPI.storeSet('offlineQueue', queue)
}
