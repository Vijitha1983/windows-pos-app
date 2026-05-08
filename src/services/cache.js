const CACHE_TTL   = 5 * 60 * 1000            // 5 min in-memory TTL
const PERSIST_TTL = 7 * 24 * 60 * 60 * 1000 // 7 day disk TTL (survives restarts)

const memCache = new Map()

// ─── Memory cache ─────────────────────────────────────────────────────────────

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
  if (!prefix) { memCache.clear(); return }
  for (const key of memCache.keys()) {
    if (key.startsWith(prefix)) memCache.delete(key)
  }
}

// ─── Persisted disk cache (electron-store, survives app restarts) ─────────────
// Keys are prefixed with 'pc__' and sanitised so electron-store dot-notation
// doesn't misinterpret colons / spaces as nested paths.

function toDiskKey(key) {
  return 'pc__' + key.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export async function cacheSetPersist(key, data) {
  cacheSet(key, data)
  try {
    await window.electronAPI.storeSet(toDiskKey(key), { data, ts: Date.now() })
  } catch { /* non-critical */ }
}

export async function cacheGetPersist(key) {
  // Memory first
  const mem = cacheGet(key)
  if (mem !== null) return mem
  // Disk fallback
  try {
    const entry = await window.electronAPI.storeGet(toDiskKey(key))
    if (!entry || Date.now() - entry.ts > PERSIST_TTL) return null
    cacheSet(key, entry.data) // warm memory
    return entry.data
  } catch {
    return null
  }
}

// Like cacheGetPersist but ignores TTL — use as last-resort offline fallback
export async function cacheGetPersistStale(key) {
  const mem = cacheGet(key)
  if (mem !== null) return mem
  try {
    const entry = await window.electronAPI.storeGet(toDiskKey(key))
    if (!entry) return null
    return entry.data // no TTL check — stale is better than nothing when offline
  } catch {
    return null
  }
}

export async function cacheClearPersist() {
  cacheClear()
  try {
    const all = await window.electronAPI.storeGetAll()
    await Promise.all(
      Object.keys(all)
        .filter((k) => k.startsWith('pc__'))
        .map((k) => window.electronAPI.storeDelete(k))
    )
  } catch { /* non-critical */ }
}

// ─── Offline invoice queue (persisted via electron-store) ─────────────────────

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
