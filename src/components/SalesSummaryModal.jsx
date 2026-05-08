import { useEffect, useRef, useState } from 'react'
import { usePOSStore } from '../store/posStore'
import { getTodayInvoiceSummary, closePOSSession, getCategoryWiseSales, sendSummaryEmail } from '../services/api'

export default function SalesSummaryModal() {
  const {
    showSummaryModal, setShowSummaryModal,
    posProfile, posProfileData, username,
    posOpeningEntry, openingCash, sessionOpenedBy, sessionStartDate, clearPOSSession,
    setShowOpeningModal,
  } = usePOSStore()

  const [loading,      setLoading]      = useState(false)
  const [summary,      setSummary]      = useState(null)   // { invoices, totalSales, byMode, count }
  const [byCategory,   setByCategory]   = useState({})     // { item_group: amount }
  const [loadingCats,  setLoadingCats]  = useState(false)
  const [closing,      setClosing]      = useState(false)
  const [closeErr,     setCloseErr]     = useState('')
  const [closed,       setClosed]       = useState(false)
  const [mailing,      setMailing]      = useState(false)
  const [mailStatus,   setMailStatus]   = useState(null)   // null | 'ok' | 'err'
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
      const data = await getTodayInvoiceSummary(posProfile, sessionStartDate, username)
      setSummary(data)
      // Load category breakdown from POS + credit invoice items
      const posNames    = data.invoices?.map((i) => i.name) || []
      const creditNames = data.creditInvoices?.map((i) => i.name) || []
      if (posNames.length > 0 || creditNames.length > 0) {
        setLoadingCats(true)
        getCategoryWiseSales(posNames, creditNames)
          .then((cats) => setByCategory(cats))
          .catch(() => setByCategory({}))
          .finally(() => setLoadingCats(false))
      } else {
        setByCategory({})
      }
    } catch (err) {
      console.error('Summary fetch failed:', err)
      setSummary({ invoices: [], totalSales: 0, byMode: {}, count: 0 })
      setByCategory({})
    } finally {
      setLoading(false)
    }
  }

  // ── Print summary ────────────────────────────────────────────────────────
  function buildSummaryHtml(currentSummary, currentByCategory) {
    const fmtN = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const company  = posProfileData?.company || 'POS'
    const dateStr  = new Date().toLocaleString()
    const byMode   = currentSummary?.byMode || {}
    const cashKey    = Object.keys(byMode).find((k) => k.toLowerCase().includes('cash'))   || null
    const cardKey    = Object.keys(byMode).find((k) => k.toLowerCase().includes('card'))   || null
    const kokoKey    = Object.keys(byMode).find((k) => k.toLowerCase().includes('koko'))   || null
    const voucherKey = Object.keys(byMode).find((k) => k.toLowerCase().includes('gift') || k.toLowerCase().includes('voucher')) || null
    const otherModes = Object.entries(byMode).filter(([k]) => k !== cashKey && k !== cardKey && k !== kokoKey && k !== voucherKey)

    const modeRow = (label, key, amount) => key !== null
      ? `<tr><td>${label}</td><td style="text-align:right">${fmtN(amount)}</td></tr>` : ''

    const catRows = Object.entries(currentByCategory || {})
      .sort(([, a], [, b]) => b - a)
      .map(([g, a]) => `<tr><td>${g}</td><td style="text-align:right">${fmtN(a)}</td></tr>`)
      .join('')

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      body{font-family:monospace;font-size:12px;width:72mm;margin:0 auto;padding:4px}
      h1{font-size:14px;text-align:center;margin:0 0 2px}
      .c{text-align:center}
      .sep{border-top:1px dashed #000;margin:6px 0}
      table{width:100%;border-collapse:collapse}
      td{padding:1px 0}
      .bold td{font-weight:bold}
      .tot td{font-weight:bold;font-size:13px;border-top:1px solid #000;padding-top:3px}
      .sec{font-weight:bold;margin:6px 0 2px;font-size:11px;letter-spacing:.5px}
      @media print{@page{margin:0;size:80mm auto}}
    </style></head><body>
    <h1>${company}</h1>
    <p class="c" style="font-size:10px;margin:0">${dateStr}</p>
    <p class="c" style="font-size:10px;margin:0">Cashier: ${username}</p>
    <p class="c" style="font-size:10px;margin:2px 0">${posProfile}</p>
    <div class="sep"></div>

    <p class="sec">DAY SALES SUMMARY</p>
    <table>
      <tr class="tot"><td>Total Sales</td><td style="text-align:right">${fmtN(currentSummary?.totalSales)}</td></tr>
      <tr><td>Invoices</td><td style="text-align:right">${currentSummary?.count || 0}</td></tr>
    </table>
    <div class="sep"></div>

    <p class="sec">PAYMENT BREAKDOWN</p>
    <table>
      ${modeRow('Cash', cashKey, byMode[cashKey])}
      ${modeRow('Card', cardKey, byMode[cardKey])}
      ${modeRow('Koko Pay', kokoKey, byMode[kokoKey])}
      ${modeRow('Gift Voucher', voucherKey, byMode[voucherKey])}
      ${otherModes.map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right">${fmtN(v)}</td></tr>`).join('')}
      ${(currentSummary?.creditTotal > 0) ? `<tr><td>Credit Sales (Receivable)</td><td style="text-align:right">${fmtN(currentSummary.creditTotal)}</td></tr>` : ''}
    </table>
    <div class="sep"></div>

    <p class="sec">CASHIER SUMMARY</p>
    <table>
      <tr><td>Opening Cash</td><td style="text-align:right">${fmtN(openingCash)}</td></tr>
      <tr><td>Day Cash Collected</td><td style="text-align:right">${fmtN(byMode[cashKey])}</td></tr>
      <tr class="tot"><td>Total Cash in Cashier</td><td style="text-align:right">${fmtN(openingCash + (byMode[cashKey] || 0))}</td></tr>
    </table>

    ${catRows ? `
    <div class="sep"></div>
    <p class="sec">CATEGORY WISE SALES</p>
    <table>${catRows}</table>` : ''}

    <div class="sep"></div>
    <p class="c" style="margin-top:6px;font-size:10px">*** End of Report ***</p>
    </body></html>`
  }

  async function printSummary(snapshotSummary, snapshotCats) {
    try {
      const html = buildSummaryHtml(snapshotSummary ?? summary, snapshotCats ?? byCategory)
      if (window.electronAPI?.printReceipt) await window.electronAPI.printReceipt(html)
    } catch (e) {
      console.error('Summary print failed:', e)
    }
  }

  function buildEmailHtml(currentSummary, currentByCategory) {
    const fmtN = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const company  = posProfileData?.company || 'POS'
    const dateStr  = new Date().toLocaleString()
    const byMode   = currentSummary?.byMode || {}
    const cashKey    = Object.keys(byMode).find((k) => k.toLowerCase().includes('cash'))   || null
    const cardKey    = Object.keys(byMode).find((k) => k.toLowerCase().includes('card'))   || null
    const kokoKey    = Object.keys(byMode).find((k) => k.toLowerCase().includes('koko'))   || null
    const voucherKey = Object.keys(byMode).find((k) => k.toLowerCase().includes('gift') || k.toLowerCase().includes('voucher')) || null
    const otherModes = Object.entries(byMode).filter(([k]) => k !== cashKey && k !== cardKey && k !== kokoKey && k !== voucherKey)
    const cell  = (v, bold) => `<td style="padding:4px 8px;${bold ? 'font-weight:bold;' : ''}">${v}</td>`
    const rcell = (v, bold, color) => `<td style="padding:4px 8px;text-align:right;${bold ? 'font-weight:bold;' : ''}${color ? `color:${color};` : ''}">${v}</td>`
    const modeRow = (label, key, val) => key ? `<tr>${cell(label)}${rcell(fmtN(val))}</tr>` : ''
    const catRows = Object.entries(currentByCategory || {})
      .sort(([, a], [, b]) => b - a)
      .map(([g, a]) => `<tr>${cell(g)}${rcell(fmtN(a))}</tr>`).join('')

    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;font-size:13px;color:#222;max-width:500px;margin:0 auto">
      <h2 style="background:#1e3a5f;color:#fff;padding:12px 16px;margin:0">${company} — Sales Summary</h2>
      <p style="padding:8px 16px;margin:0;background:#f5f5f5;font-size:12px;color:#555">${dateStr} &nbsp;|&nbsp; Cashier: ${username} &nbsp;|&nbsp; ${posProfile}</p>

      <div style="padding:12px 16px">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px">
          <thead><tr style="background:#e8f0fe"><td colspan="2" style="padding:6px 8px;font-weight:bold">DAY SALES SUMMARY</td></tr></thead>
          <tbody>
            <tr style="font-size:15px;font-weight:bold">${cell('Total Sales')}${rcell(fmtN(currentSummary?.totalSales), true, '#1a56db')}</tr>
            <tr>${cell('Total Invoices')}${rcell(currentSummary?.count || 0)}</tr>
          </tbody>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px">
          <thead><tr style="background:#e8f0fe"><td colspan="2" style="padding:6px 8px;font-weight:bold">PAYMENT BREAKDOWN</td></tr></thead>
          <tbody>
            ${modeRow('Cash', cashKey, byMode[cashKey])}
            ${modeRow('Card', cardKey, byMode[cardKey])}
            ${modeRow('Koko Pay', kokoKey, byMode[kokoKey])}
            ${modeRow('Gift Voucher', voucherKey, byMode[voucherKey])}
            ${otherModes.map(([k, v]) => `<tr>${cell(k)}${rcell(fmtN(v))}</tr>`).join('')}
            ${(currentSummary?.creditTotal > 0) ? `<tr>${cell('Credit Sales (Receivable)')}${rcell(fmtN(currentSummary.creditTotal), false, '#d97706')}</tr>` : ''}
          </tbody>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px">
          <thead><tr style="background:#e8f0fe"><td colspan="2" style="padding:6px 8px;font-weight:bold">CASHIER SUMMARY</td></tr></thead>
          <tbody>
            <tr>${cell('Opening Cash')}${rcell(fmtN(openingCash))}</tr>
            <tr>${cell('Day Cash Collected')}${rcell(fmtN(byMode[cashKey]))}</tr>
            <tr style="font-size:14px">${cell('<strong>Total Cash in Cashier</strong>')}${rcell(fmtN(openingCash + (byMode[cashKey] || 0)), true, '#b45309')}</tr>
          </tbody>
        </table>

        ${catRows ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <thead><tr style="background:#e8f0fe"><td colspan="2" style="padding:6px 8px;font-weight:bold">CATEGORY WISE SALES</td></tr></thead>
          <tbody>${catRows}</tbody>
        </table>` : ''}
      </div>
      <p style="padding:8px 16px;margin:0;font-size:11px;color:#888">This report was generated automatically by ERPNext POS.</p>
    </body></html>`
  }

  async function handleMailSummary() {
    const toEmail = posProfileData?.custom_mail_id
    if (!toEmail || !summary) return
    setMailing(true)
    setMailStatus(null)
    try {
      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      const subject = `Sales Summary — ${posProfileData?.company || posProfile} — ${today}`
      const html = buildEmailHtml(summary, byCategory)
      await sendSummaryEmail(toEmail, subject, html)
      setMailStatus('ok')
      setTimeout(() => setMailStatus(null), 4000)
    } catch {
      setMailStatus('err')
      setTimeout(() => setMailStatus(null), 4000)
    } finally {
      setMailing(false)
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
      // Auto-print summary on session close — snapshot current data before it resets
      printSummary(summary, byCategory)
    } catch (err) {
      const data = err?.response?.data || {}

      // ERPNext puts the real message in _server_messages (JSON array of objects)
      let plain = ''
      if (data._server_messages) {
        try {
          const msgs = JSON.parse(data._server_messages)
          plain = msgs
            .map((m) => {
              try { return JSON.parse(m).message || '' } catch { return m }
            })
            .join(' ')
        } catch {}
      }
      // Fallback: exc field has the Python traceback — last line is most useful
      if (!plain && data.exc) {
        const lines = data.exc.split('\n').filter(Boolean)
        plain = lines[lines.length - 1] || ''
      }
      // Final fallback
      if (!plain) plain = data.message || err.message || 'Failed to close session'

      // Strip HTML tags
      plain = plain.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

      if (plain.toLowerCase().includes('item price updated')) {
        setCloseErr(
          'ERPNext is auto-updating Standard Selling prices during consolidation. ' +
          'To disable: ERPNext → Stock Settings → uncheck "Auto Update Price List Rate Based on Transaction".'
        )
      } else if (plain.toLowerCase().includes('serial no') || plain.toLowerCase().includes('batch no')) {
        setCloseErr(
          'One or more invoices have items that require Serial No / Batch No but were not entered at billing time. ' +
          'Please open those invoices in ERPNext, add the Serial No / Batch No to the items, then try closing again. ' +
          'Going forward, enter Serial No / Batch No in the item dialog when adding tracked items to the bill.'
        )
      } else {
        setCloseErr(plain || 'Failed to close session')
      }
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
  const kokoKey    = Object.keys(byMode).find((k) => k.toLowerCase().includes('koko'))   || null
  const voucherKey = Object.keys(byMode).find(
    (k) => k.toLowerCase().includes('gift') || k.toLowerCase().includes('voucher')
  ) || null
  const cashSales    = cashKey    ? (byMode[cashKey]    || 0) : 0
  const cardSales    = cardKey    ? (byMode[cardKey]    || 0) : 0
  const kokoSales    = kokoKey    ? (byMode[kokoKey]    || 0) : 0
  const voucherSales = voucherKey ? (byMode[voucherKey] || 0) : 0
  const otherModes = Object.entries(byMode).filter(
    ([k]) => k !== cashKey && k !== cardKey && k !== kokoKey && k !== voucherKey
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
              onClick={() => printSummary()}
              disabled={!summary || loading}
              title="Print summary"
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-40"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
            </button>
            {posProfileData?.custom_mail_id && (
              <button
                onClick={handleMailSummary}
                disabled={!summary || loading || mailing}
                title={`Email summary to ${posProfileData.custom_mail_id}`}
                className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${
                  mailStatus === 'ok'  ? 'text-green-400 bg-green-900/30' :
                  mailStatus === 'err' ? 'text-red-400 bg-red-900/30' :
                  'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {mailing ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                ) : mailStatus === 'ok' ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : mailStatus === 'err' ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            )}
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

          {/* ── Mail status toast ── */}
          {mailStatus === 'ok' && (
            <div className="bg-green-900/30 border border-green-700 rounded-xl px-4 py-2.5 flex items-center gap-2 text-green-300 text-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Summary sent to {posProfileData?.custom_mail_id}
            </div>
          )}
          {mailStatus === 'err' && (
            <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-2.5 flex items-center gap-2 text-red-300 text-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Failed to send — check ERPNext outgoing email settings
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
                  <span className="ml-auto text-xs text-gray-500">
                    {(summary.count + (summary.creditCount || 0))} invoice{(summary.count + (summary.creditCount || 0)) !== 1 ? 's' : ''}
                    {summary.creditCount > 0 && <span className="text-amber-500 ml-1">({summary.creditCount} credit)</span>}
                  </span>
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

                  {/* Koko Pay Sales */}
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-700/40">
                    <div className="flex items-center gap-2.5 pl-4">
                      <div className="w-2 h-2 rounded-full bg-orange-400" />
                      <span className="text-gray-400 text-sm">
                        Koko Pay
                        {hasBreakdown && summary.totalSales > 0 && kokoSales > 0 && (
                          <span className="ml-2 text-gray-600 text-xs">
                            ({((kokoSales / summary.totalSales) * 100).toFixed(0)}%)
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="font-semibold tabular-nums text-sm">
                      {hasBreakdown
                        ? <span className="text-orange-400">{fmt(kokoSales)}</span>
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

                  {/* Credit Sales (Sales Invoices — receivables) */}
                  {summary.creditTotal > 0 && (
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-700/40">
                      <div className="flex items-center gap-2.5 pl-4">
                        <div className="w-2 h-2 rounded-full bg-amber-400" />
                        <span className="text-gray-400 text-sm">
                          Credit Sales
                          {summary.totalSales > 0 && (
                            <span className="ml-2 text-gray-600 text-xs">
                              ({((summary.creditTotal / summary.totalSales) * 100).toFixed(0)}%)
                            </span>
                          )}
                        </span>
                      </div>
                      <span className="text-amber-400 font-semibold tabular-nums text-sm">{fmt(summary.creditTotal)}</span>
                    </div>
                  )}

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

              {/* ══ CATEGORY WISE SALES ══ */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-5 rounded-full bg-teal-500" />
                  <h3 className="text-white font-bold text-sm uppercase tracking-wider">Category Wise Sales</h3>
                  {loadingCats && (
                    <svg className="w-3.5 h-3.5 animate-spin text-gray-500 ml-1" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                  )}
                </div>

                <div className="bg-gray-900/50 rounded-xl border border-gray-700 overflow-hidden">
                  {Object.keys(byCategory).length === 0 ? (
                    <div className="px-5 py-5 text-center text-gray-500 text-sm">
                      {loadingCats ? 'Loading…' : summary.count === 0 ? 'No sales today' : 'Category data unavailable'}
                    </div>
                  ) : (
                    Object.entries(byCategory)
                      .sort(([, a], [, b]) => b - a)
                      .map(([group, amount], i, arr) => {
                        const pct = summary.totalSales > 0 ? ((amount / summary.totalSales) * 100).toFixed(0) : 0
                        return (
                          <div
                            key={group}
                            className={`flex items-center justify-between px-5 py-3.5 ${i < arr.length - 1 ? 'border-b border-gray-700/40' : ''}`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0" />
                              <span className="text-gray-300 text-sm">{group}</span>
                              <span className="text-gray-600 text-xs">{pct}%</span>
                            </div>
                            <span className="text-teal-400 font-semibold tabular-nums text-sm">{fmt(amount)}</span>
                          </div>
                        )
                      })
                  )}
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
          {closed ? (
            /* After closing entry submitted — big green done button */
            <button
              type="button"
              onClick={handleClose}
              autoFocus
              className="flex-1 bg-green-600 hover:bg-green-500 active:bg-green-700 text-white font-bold py-4 rounded-xl transition-colors text-base flex items-center justify-center gap-2 shadow-lg shadow-green-900/40"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Done — Open New Session
            </button>
          ) : (
            <>
              {posOpeningEntry && (
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
                Close
                <span className="ml-2 text-xs opacity-40">ESC</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
