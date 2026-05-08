import { useState, useEffect } from 'react'
import { usePOSStore } from '../store/posStore'
import { getQueuedInvoices } from '../services/cache'
import { createPOSInvoice, submitPOSInvoice } from '../services/api'

export default function OfflineQueueModal({ onClose, onQueueChange }) {
  const { isOnline } = usePOSStore()
  const [queue, setQueue]       = useState([])
  const [results, setResults]   = useState({})  // ts → { status, error, name }
  const [syncing, setSyncing]   = useState(false)
  const [syncIdx, setSyncIdx]   = useState(0)

  useEffect(() => { loadQueue() }, [])

  async function loadQueue() {
    const q = await getQueuedInvoices()
    setQueue(q)
    return q
  }

  // Auto-sync immediately when modal opens and we are online
  useEffect(() => {
    if (isOnline) handleSync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSync() {
    if (!isOnline || syncing) return
    const q = await loadQueue()
    if (q.length === 0) return

    setSyncing(true)
    setSyncIdx(0)
    const newResults = {}

    for (let i = 0; i < q.length; i++) {
      const entry = q[i]
      setSyncIdx(i + 1)
      newResults[entry.ts] = { status: 'syncing' }
      setResults({ ...newResults })

      try {
        const draft = await createPOSInvoice(entry.invoice)
        if (!draft?.name) throw new Error('No invoice name returned')
        await submitPOSInvoice(draft.name)
        newResults[entry.ts] = { status: 'ok', name: draft.name }
      } catch (err) {
        let msg = err?.message || 'Failed'
        newResults[entry.ts] = { status: 'error', error: msg }
      }
      setResults({ ...newResults })
    }

    // Rebuild queue — keep only failed entries
    const successTs = new Set(
      Object.entries(newResults).filter(([, r]) => r.status === 'ok').map(([ts]) => Number(ts))
    )
    const remaining = q.filter((e) => !successTs.has(e.ts))
    await window.electronAPI.storeSet('offlineQueue', remaining)
    setQueue(remaining)
    onQueueChange?.(remaining.length)
    setSyncing(false)
  }

  function getTotal(invoice) {
    if (invoice.paid_amount != null) return parseFloat(invoice.paid_amount)
    return (invoice.payments || []).reduce((s, p) => s + (p.amount || 0), 0)
  }

  const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const okCount   = Object.values(results).filter((r) => r.status === 'ok').length
  const errCount  = Object.values(results).filter((r) => r.status === 'error').length
  const allDone   = queue.length === 0 && okCount > 0

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-700 flex flex-col max-h-[88vh]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">Offline Invoice Queue</h2>
            <p className="text-gray-400 text-xs mt-0.5">
              {queue.length > 0
                ? `${queue.length} invoice${queue.length !== 1 ? 's' : ''} waiting to sync`
                : 'Queue is clear'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
              isOnline ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'}`} />
              {isOnline ? 'Online' : 'Offline'}
            </div>
            <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">

          {/* Success banner */}
          {okCount > 0 && (
            <div className="bg-green-900/30 border border-green-700 rounded-xl px-4 py-3 flex items-center gap-2 text-green-300 text-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              {okCount} invoice{okCount !== 1 ? 's' : ''} submitted to ERPNext successfully
            </div>
          )}

          {/* Error banner */}
          {errCount > 0 && (
            <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm">
              {errCount} invoice{errCount !== 1 ? 's' : ''} failed — check the errors below and retry
            </div>
          )}

          {/* Empty state */}
          {queue.length === 0 && okCount === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-500">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm">No invoices in queue</span>
            </div>
          )}

          {/* All synced state */}
          {allDone && errCount === 0 && (
            <div className="text-center py-4 text-gray-400 text-sm">
              All invoices synced — queue is clear
            </div>
          )}

          {/* Invoice list */}
          {queue.map((entry) => {
            const res = results[entry.ts]
            const total = getTotal(entry.invoice)
            const itemCount = entry.invoice.items?.length || 0
            const isSyncing = res?.status === 'syncing'
            const isFailed  = res?.status === 'error'

            return (
              <div
                key={entry.ts}
                className={`rounded-xl border p-4 transition-colors ${
                  isSyncing ? 'border-blue-600 bg-blue-900/20'
                  : isFailed ? 'border-red-700 bg-red-900/20'
                  : 'border-gray-700 bg-gray-700/30'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {isSyncing ? (
                        <svg className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                        </svg>
                      ) : isFailed ? (
                        <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0 mt-1" />
                      )}
                      <span className="text-white text-sm font-medium truncate">
                        {entry.invoice.customer || 'Walk-in Customer'}
                      </span>
                    </div>
                    <div className="text-gray-400 text-xs mt-1 ml-6">
                      {new Date(entry.ts).toLocaleString()} &nbsp;·&nbsp; {itemCount} item{itemCount !== 1 ? 's' : ''}
                    </div>
                    {isFailed && (
                      <div className="text-red-400 text-xs mt-1 ml-6 break-words">{res.error}</div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-white font-bold tabular-nums">{fmt(total)}</div>
                    <div className={`text-xs mt-0.5 ${
                      isSyncing ? 'text-blue-400' : isFailed ? 'text-red-400' : 'text-yellow-400'
                    }`}>
                      {isSyncing ? 'Submitting…' : isFailed ? 'Failed' : 'Pending'}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 pb-5 pt-3 border-t border-gray-700 flex gap-3 flex-shrink-0">
          {queue.length > 0 && (
            <button
              onClick={handleSync}
              disabled={!isOnline || syncing}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-3 rounded-xl transition-colors text-sm"
            >
              {syncing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Syncing {syncIdx} / {queue.length + okCount}…
                </>
              ) : !isOnline
                ? 'Offline — Cannot Sync'
                : `Submit ${queue.length} Invoice${queue.length !== 1 ? 's' : ''} to ERPNext`}
            </button>
          )}
          <button
            onClick={onClose}
            className={`${queue.length > 0 ? '' : 'flex-1 '}bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold py-3 px-6 rounded-xl transition-colors text-sm`}
          >
            {allDone && errCount === 0 ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
