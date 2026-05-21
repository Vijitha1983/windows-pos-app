import { useEffect, useRef, useState } from 'react'
import { usePOSStore } from '../store/posStore'
import { getTodayInvoiceSummary, closePOSSession, getCategoryWiseSales, sendSummaryEmail } from '../services/api'
import { cacheClearPersist, cacheGetPersist } from '../services/cache'

export default function SalesSummaryModal() {
  const {
    showSummaryModal, setShowSummaryModal,
    posProfile, posProfileData, username,
    posOpeningEntry, openingCash, sessionOpenedBy, sessionStartDate, clearPOSSession,
    setShowOpeningModal,
  } = usePOSStore()

  const [loading,      setLoading]      = useState(false)
  const [summary,      setSummary]      = useState(null)   // { invoices, totalSales, byMode, returnTotal, count }
  const [byCategory,   setByCategory]   = useState({})
  const [loadingCats,  setLoadingCats]  = useState(false)
  const [closing,      setClosing]      = useState(false)
  const [closeErr,     setCloseErr]     = useState('')
  const [closeErrRaw,  setCloseErrRaw]  = useState('')    // full traceback for copy
  const [closed,            setClosed]            = useState(false)
  const [clearCacheOnClose, setClearCacheOnClose] = useState(false)
  const [cacheCleared,      setCacheCleared]      = useState(false)
  const [mailing,      setMailing]      = useState(false)
  const [mailStatus,   setMailStatus]   = useState(null)   // null | 'ok' | 'err'
  const [copied,       setCopied]       = useState(false)
  const [returnTypes,  setReturnTypes]  = useState({})     // invoiceName → 'exchange' | 'refund'
  const [exchangeOverpayMap, setExchangeOverpayMap] = useState({}) // invoiceName → overpay amount
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
    // No session open — nothing to show; clear any stale data from a previous visit
    if (!posOpeningEntry) {
      setSummary(null)
      setByCategory({})
      return
    }
    setLoading(true)
    try {
      const data = await getTodayInvoiceSummary(posProfile, sessionStartDate, username)
      setSummary(data)
      const [storedTypes, storedOverpayMap] = await Promise.all([
        cacheGetPersist('returnTypeMap'),
        cacheGetPersist('exchangeOverpayMap'),
      ])
      setReturnTypes(storedTypes || {})
      setExchangeOverpayMap(storedOverpayMap || {})
      // Category breakdown — use only regular (non-return) POS invoices + credit invoices
      // so negative return amounts don't pollute the category totals.
      const posNames    = (data.invoices || []).filter((i) => !i.is_return).map((i) => i.name)
      const creditNames = (data.creditInvoices || []).map((i) => i.name)
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
      setSummary({ invoices: [], totalSales: 0, byMode: {}, returnTotal: 0, count: 0 })
      setByCategory({})
    } finally {
      setLoading(false)
    }
  }

  // ── Print summary ────────────────────────────────────────────────────────
  function buildSummaryHtml(currentSummary, currentByCategory, billHeader, billFooter, billHeaderImage, billFooterImage, storedReturnTypes) {
    const f = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const now        = new Date()
    const dateStr    = now.toLocaleDateString()
    const timeStr    = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    const byMode     = currentSummary?.byMode      || {}
    const byModeG    = currentSummary?.byModeGross || {}
    const changeGiven = parseFloat(currentSummary?.totalChangeGiven || 0)

    const cashKey    = Object.keys(byModeG).find((k) => k.toLowerCase().includes('cash'))    || null
    const cardKey    = Object.keys(byModeG).find((k) => k.toLowerCase().includes('card'))    || null
    const kokoKey    = Object.keys(byModeG).find((k) => k.toLowerCase().includes('koko'))    || null
    const voucherKey = Object.keys(byModeG).find((k) => k.toLowerCase().includes('gift') || k.toLowerCase().includes('voucher')) || null
    const otherModes = Object.entries(byModeG).filter(([k, v]) => k !== cashKey && k !== cardKey && k !== kokoKey && k !== voucherKey && v > 0)

    const rInvoices  = (currentSummary?.invoices || []).filter((i) => i.is_return)
    const rt         = storedReturnTypes || {}
    const exchAdj    = rInvoices.filter((r) => rt[r.name] === 'exchange').reduce((s, r) => s + Math.abs(r.grand_total || 0), 0)
    const refundOnly = rInvoices.filter((r) => rt[r.name] === 'refund').reduce((s, r) => s + Math.abs(r.grand_total || 0), 0)
    // Subtract exchAdj: exchange new invoices have a Cash return-credit row that inflates byModeGross
    // exchOverpay: overpaid return credit (return > new item) — not real change, tracked as refund
    const regularNamesP   = new Set((currentSummary?.invoices || []).filter(i => !i.is_return).map(i => i.name))
    const exchOverpay     = Object.entries(exchangeOverpayMap).filter(([n]) => regularNamesP.has(n)).reduce((s, [, v]) => s + v, 0)
    const cashSales      = cashKey ? (byModeG[cashKey] || 0) - (changeGiven - exchOverpay) - exchAdj : 0
    const netCashCollect = cashKey ? (byModeG[cashKey] || 0) - (changeGiven - exchOverpay) - exchAdj : 0
    const refundCash     = refundOnly + exchOverpay
    const totalCash      = openingCash + netCashCollect - refundCash
    const netSales       = (currentSummary?.totalSales || 0) - (currentSummary?.returnTotal || 0)

    const row = (label, val, opts = {}) => {
      const indent = opts.indent ? 'padding-left:6px;' : ''
      const bold   = opts.bold   ? 'font-weight:bold;' : ''
      const color  = opts.color  ? `color:${opts.color};` : ''
      const size   = opts.large  ? 'font-size:46px;' : ''
      const bt     = opts.topLine ? 'border-top:1px solid #000;' : ''
      const bb     = opts.botLine ? 'border-bottom:1px solid #000;' : ''
      return `<tr style="${bt}${bb}">
        <td style="padding:1.5px 4px 1.5px 0;${indent}${color}">${label}</td>
        <td style="text-align:right;padding:1.5px 0;white-space:nowrap;${bold}${color}${size}">${val}</td>
      </tr>`
    }

    const toHtml = (s) => (!s ? '' : s.includes('<') ? s : s.replace(/\n/g, '<br>'))
    const headerImgHtml = billHeaderImage ? `<div style="text-align:center;margin-bottom:8px"><img src="${billHeaderImage}" style="max-width:100%;max-height:44mm;object-fit:contain"/></div>` : ''
    const headerTxtHtml = billHeader      ? `<div style="text-align:center;margin-bottom:8px;line-height:1.5;font-size:32px">${toHtml(billHeader)}</div>` : ''
    const footerTxtHtml = billFooter      ? `<div style="text-align:center;margin-top:10px;line-height:1.5;font-size:28px">${toHtml(billFooter)}</div>` : ''
    const footerImgHtml = billFooterImage ? `<div style="text-align:center;margin-top:6px"><img src="${billFooterImage}" style="max-width:100%;max-height:30mm;object-fit:contain"/></div>` : ''

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=800">
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;font-size:38px;width:100%;padding:4mm}
      .sep{border-top:3px dashed #000;margin:10px 0}
      table{width:100%;border-collapse:collapse}
      td{font-size:38px;vertical-align:top}
      .sec{font-size:36px;font-weight:bold;letter-spacing:.5px;text-transform:uppercase;border-bottom:3px solid #000;padding-bottom:4px;margin:10px 0 5px}
      @page{margin:0;size:80mm auto}
    </style></head><body>

    ${headerImgHtml}${headerTxtHtml}
    <div class="sep"></div>

    <table>
      <tr>
        <td style="font-weight:bold">${username}</td>
        <td style="text-align:right;font-size:10px">${dateStr} ${timeStr}</td>
      </tr>
      <tr>
        <td style="font-size:10px;color:#555">${posProfile}</td>
        <td style="text-align:right;font-size:10px;color:#555">${posOpeningEntry || ''}</td>
      </tr>
    </table>
    <div class="sep"></div>

    <p class="sec">Day Sales Summary</p>
    <table>
      ${row('Total Sales', f(currentSummary?.totalSales), { bold: true, topLine: true, botLine: true, large: true })}
      <tr style="height:3px"></tr>
      ${cashKey    ? row('Cash Sales',    f(cashSales),                           { indent: true }) : ''}
      ${cardKey    ? row('Card Sales',    f(byModeG[cardKey] || 0),               { indent: true }) : ''}
      ${kokoKey    ? row('Koko Pay',      f(byModeG[kokoKey] || 0),              { indent: true }) : ''}
      ${voucherKey ? row('Gift Voucher',  f(byModeG[voucherKey] || 0),           { indent: true }) : ''}
      ${otherModes.map(([k, v]) => row(k, f(v), { indent: true })).join('')}
      ${rInvoices.length > 0 ? row('Return / Exchange', exchAdj  > 0 ? `(${f(exchAdj)})`  : '—', { indent: true, color: '#c00' }) : ''}
      ${rInvoices.length > 0 ? row('Refund Only',       refundOnly > 0 ? `(${f(refundOnly)})` : '—', { indent: true, color: '#c00' }) : ''}
      ${(currentSummary?.creditTotal > 0) ? row('Credit Sales', f(currentSummary.creditTotal), { indent: true }) : ''}
      ${row('Net Sales Value', f(netSales), { bold: true, topLine: true })}
    </table>
    <div class="sep"></div>

    <p class="sec">Cashier Summary</p>
    <table>
      ${row('Opening Cash',          f(openingCash))}
      ${row('Net Cash Collected',    f(netCashCollect))}
      ${refundCash > 0 ? row('Refund Paid', `(${f(refundCash)})`, { color: '#c00' }) : ''}
      ${row('Total Cash in Cashier', f(totalCash), { bold: true, topLine: true, botLine: true, large: true })}
    </table>

    ${Object.keys(currentByCategory || {}).length > 0 ? `
    <div class="sep"></div>
    <p class="sec">Category Wise Sales</p>
    <table>
      ${Object.entries(currentByCategory)
        .sort(([, a], [, b]) => b - a)
        .map(([g, a]) => row(g, f(a)))
        .join('')}
    </table>` : ''}

    <div class="sep"></div>
    <p style="text-align:center;font-size:10px;margin-top:4px">*** End of Report ***</p>
    ${footerTxtHtml}${footerImgHtml}
    </body></html>`
  }

  async function printSummary(snapshotSummary, snapshotCats) {
    try {
      const snap = snapshotSummary ?? summary
      const cats = snapshotCats ?? byCategory
      const [billHeader, billFooter, billHeaderImage, billFooterImage, receiptPrinter] = await Promise.all([
        window.electronAPI.storeGet('billHeader').catch(() => ''),
        window.electronAPI.storeGet('billFooter').catch(() => ''),
        window.electronAPI.storeGet('billHeaderImage').catch(() => null),
        window.electronAPI.storeGet('billFooterImage').catch(() => null),
        window.electronAPI.storeGet('receiptPrinter').catch(() => ''),
      ])
      const html = buildSummaryHtml(snap, cats, billHeader || '', billFooter || '', billHeaderImage, billFooterImage, returnTypes)
      if (window.electronAPI?.printReceipt) await window.electronAPI.printReceipt(html, receiptPrinter || undefined)
    } catch (e) {
      console.error('Summary print failed:', e)
    }
  }

  function buildEmailHtml(currentSummary, currentByCategory) {
    const fmtN = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const company    = posProfileData?.company || 'POS'
    const dateStr    = new Date().toLocaleString()
    const byMode      = currentSummary?.byMode || {}
    const byModeG2    = currentSummary?.byModeGross || {}
    const retTotal    = currentSummary?.returnTotal || 0
    const changeGiven = parseFloat(currentSummary?.totalChangeGiven || 0)
    const cashKey    = Object.keys(byModeG2).find((k) => k.toLowerCase().includes('cash'))   || null
    const cardKey    = Object.keys(byModeG2).find((k) => k.toLowerCase().includes('card'))   || null
    const kokoKey    = Object.keys(byModeG2).find((k) => k.toLowerCase().includes('koko'))   || null
    const voucherKey = Object.keys(byModeG2).find((k) => k.toLowerCase().includes('gift') || k.toLowerCase().includes('voucher')) || null
    const otherModes = Object.entries(byModeG2).filter(([k]) => k !== cashKey && k !== cardKey && k !== kokoKey && k !== voucherKey)
    const rInvsE      = (currentSummary?.invoices || []).filter((i) => i.is_return)
    const exchAdjE    = rInvsE.filter((r) => returnTypes[r.name] === 'exchange').reduce((s, r) => s + Math.abs(r.grand_total || 0), 0)
    const refundOnlyE = rInvsE.filter((r) => returnTypes[r.name] === 'refund').reduce((s, r) => s + Math.abs(r.grand_total || 0), 0)
    const regNamesE   = new Set((currentSummary?.invoices || []).filter(i => !i.is_return).map(i => i.name))
    const exchOverpayE = Object.entries(exchangeOverpayMap).filter(([n]) => regNamesE.has(n)).reduce((s, [, v]) => s + v, 0)
    const netCash     = cashKey ? (byModeG2[cashKey] || 0) - (changeGiven - exchOverpayE) - exchAdjE : 0
    const refundPaid  = refundOnlyE + exchOverpayE
    const totalCash   = openingCash + netCash - refundPaid
    const cell  = (v, bold) => `<td style="padding:4px 8px;${bold ? 'font-weight:bold;' : ''}">${v}</td>`
    const rcell = (v, bold, color) => `<td style="padding:4px 8px;text-align:right;${bold ? 'font-weight:bold;' : ''}${color ? `color:${color};` : ''}">${v}</td>`
    const modeRow = (label, key, val) => key && val > 0 ? `<tr>${cell(label)}${rcell(fmtN(Math.max(0, val)))}</tr>` : ''

    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;font-size:13px;color:#222;max-width:500px;margin:0 auto">
      <h2 style="background:#1e3a5f;color:#fff;padding:12px 16px;margin:0">${company} — Sales Summary</h2>
      <p style="padding:8px 16px;margin:0;background:#f5f5f5;font-size:12px;color:#555">${dateStr} &nbsp;|&nbsp; Cashier: ${username} &nbsp;|&nbsp; ${posProfile}</p>

      <div style="padding:12px 16px">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px">
          <thead><tr style="background:#e8f0fe"><td colspan="2" style="padding:6px 8px;font-weight:bold">DAY SALES SUMMARY</td></tr></thead>
          <tbody>
            <tr style="font-size:15px;font-weight:bold">${cell('Total Sales')}${rcell(fmtN(currentSummary?.totalSales), true, '#1a56db')}</tr>
            <tr>${cell('Invoices')}${rcell(`${currentSummary?.count || 0}${(currentSummary?.returnCount || 0) > 0 ? ` (+${currentSummary.returnCount} return)` : ''}`)}</tr>
          </tbody>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px">
          <thead><tr style="background:#e8f0fe"><td colspan="2" style="padding:6px 8px;font-weight:bold">PAYMENT BREAKDOWN</td></tr></thead>
          <tbody>
            ${modeRow('Cash', cashKey, netCash)}
            ${modeRow('Card', cardKey, byModeG2[cardKey])}
            ${modeRow('Koko Pay', kokoKey, byModeG2[kokoKey])}
            ${modeRow('Gift Voucher', voucherKey, byModeG2[voucherKey])}
            ${otherModes.filter(([, v]) => v > 0).map(([k, v]) => `<tr>${cell(k)}${rcell(fmtN(v))}</tr>`).join('')}
            ${retTotal > 0 ? `<tr>${cell('Return / Exchange (setoff)')}${rcell('(' + fmtN(retTotal) + ')', false, '#d97706')}</tr>` : ''}
            ${(currentSummary?.creditTotal > 0) ? `<tr>${cell('Credit Sales (Receivable)')}${rcell(fmtN(currentSummary.creditTotal), false, '#d97706')}</tr>` : ''}
          </tbody>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px">
          <thead><tr style="background:#e8f0fe"><td colspan="2" style="padding:6px 8px;font-weight:bold">CASHIER SUMMARY</td></tr></thead>
          <tbody>
            <tr>${cell('Opening Cash')}${rcell(fmtN(openingCash))}</tr>
            <tr>${cell('Net Cash Collected')}${rcell(fmtN(netCash), false, netCash < 0 ? '#dc2626' : '#16a34a')}</tr>
            ${refundPaid > 0 ? `<tr>${cell('Refund Paid')}${rcell('(' + fmtN(refundPaid) + ')', false, '#dc2626')}</tr>` : ''}
            <tr style="font-size:14px">${cell('<strong>Total Cash in Cashier</strong>')}${rcell(fmtN(totalCash), true, '#b45309')}</tr>
          </tbody>
        </table>

        ${Object.keys(currentByCategory || {}).length > 0 ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <thead><tr style="background:#e8f0fe"><td colspan="2" style="padding:6px 8px;font-weight:bold">CATEGORY WISE SALES</td></tr></thead>
          <tbody>
            ${Object.entries(currentByCategory)
              .sort(([, a], [, b]) => b - a)
              .map(([g, a]) => `<tr>${cell(g)}${rcell(fmtN(a))}</tr>`).join('')}
          </tbody>
        </table>` : ''}
      </div>
      <p style="padding:8px 16px;margin:0;font-size:11px;color:#888">This report was generated automatically by Orbis POS.</p>
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
    setCloseErrRaw('')
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
      if (clearCacheOnClose) {
        await cacheClearPersist()
        setCacheCleared(true)
      }
      // Auto-print summary on session close — snapshot current data before it resets
      printSummary(summary, byCategory)
    } catch (err) {
      const data = err?.response?.data || {}

      // Save raw traceback for copy button
      const rawExc = data.exc || ''
      setCloseErrRaw(rawExc || err.message || '')

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

  async function copyErrorToClipboard() {
    const text = closeErrRaw || closeErr
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback: write to a textarea and execCommand
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
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
  // byMode     = net (cashier formula) — includes negative return payments
  // byModeGross = gross from non-return invoices only — used for sales display rows
  const byMode      = summary?.byMode      || {}
  const byModeGross = summary?.byModeGross || {}
  const hasBreakdown = Object.keys(byMode).length > 0
  const cashKey    = Object.keys(byMode).find((k) => k.toLowerCase().includes('cash'))   || null
  const cardKey    = Object.keys(byMode).find((k) => k.toLowerCase().includes('card'))   || null
  const kokoKey    = Object.keys(byMode).find((k) => k.toLowerCase().includes('koko'))   || null
  const voucherKey = Object.keys(byMode).find(
    (k) => k.toLowerCase().includes('gift') || k.toLowerCase().includes('voucher')
  ) || null
  const returnInvoices  = (summary?.invoices || []).filter(i => i.is_return)
  const exchangeAdj     = returnInvoices
    .filter(r => returnTypes[r.name] === 'exchange')
    .reduce((s, r) => s + Math.abs(r.grand_total || 0), 0)
  const refundOnlyTotal = returnInvoices
    .filter(r => returnTypes[r.name] === 'refund')
    .reduce((s, r) => s + Math.abs(r.grand_total || 0), 0)
  const changeGiven   = parseFloat(summary?.totalChangeGiven || 0)
  // exchangeOverpayTotal = cash paid back to customer when return credit > new item value
  // (e.g. return 2850, new item 1900 → give back 950). Stored in cache by PaymentModal.
  // These appear in totalChangeGiven (change_amount on the new invoice) but must be treated
  // as Refund Paid, not as regular change, so we add them back before subtracting changeGiven.
  const regularInvNames    = new Set((summary?.invoices || []).filter(i => !i.is_return).map(i => i.name))
  const exchangeOverpayTotal = Object.entries(exchangeOverpayMap)
    .filter(([name]) => regularInvNames.has(name))
    .reduce((s, [, v]) => s + v, 0)

  // byModeGross['Cash'] is inflated by exchange return-credit rows (ERPNext records
  // the applied return credit as a Cash payment on the new exchange invoice).
  // Subtract exchangeAdj to get the real cash collected.
  const cashSales    = cashKey ? (byModeGross[cashKey] || 0) - (changeGiven - exchangeOverpayTotal) - exchangeAdj : 0
  const cardSales    = cardKey    ? (byModeGross[cardKey]    || 0) : 0
  const kokoSales    = kokoKey    ? (byModeGross[kokoKey]    || 0) : 0
  const voucherSales = voucherKey ? (byModeGross[voucherKey] || 0) : 0
  const otherModes = Object.entries(byModeGross).filter(
    ([k, v]) => k !== cashKey && k !== cardKey && k !== kokoKey && k !== voucherKey && v > 0
  )
  const returnTotal    = summary?.returnTotal || 0
  const netSalesValue  = (summary?.totalSales || 0) - returnTotal

  // Net Cash Collected = real cash received (gross minus change minus exchange credits)
  // Exchange overpayments are removed from changeGiven and added to refundCashPaid instead
  const netCashCollected = cashKey ? (byModeGross[cashKey] || 0) - (changeGiven - exchangeOverpayTotal) - exchangeAdj : 0
  const refundCashPaid   = refundOnlyTotal + exchangeOverpayTotal
  const totalInCashier   = openingCash + netCashCollected - refundCashPaid

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div
        ref={containerRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl border border-gray-600 outline-none flex flex-col max-h-[90vh]"
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
              disabled={loading || !posOpeningEntry}
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
                {cacheCleared && (
                  <p className="text-green-400/60 text-xs mt-0.5">Item cache cleared ✓</p>
                )}
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

          {/* ── No session state (not shown if we just closed one this visit) ── */}
          {!posOpeningEntry && !closed && !loading && (
            <div className="flex flex-col items-center justify-center py-14 gap-4">
              <div className="w-14 h-14 rounded-full bg-gray-700/60 flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-gray-400 text-sm font-semibold">No Active POS Session</p>
                <p className="text-gray-600 text-xs mt-1">Open a session to view sales data and cashier balance</p>
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
              {/* ── Landscape: left (sales + category) + right (cashier) ── */}
              <div className="flex gap-5 items-start">

                {/* LEFT COLUMN: Day Sales + Category */}
                <div className="flex-1 space-y-5 min-w-0">

              {/* ══ DAY SALES SUMMARY ══ */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-5 rounded-full bg-blue-500" />
                  <h3 className="text-white font-bold text-sm uppercase tracking-wider">Day Sales Summary</h3>
                  <span className="ml-auto text-xs text-gray-500">
                    {(summary.count + (summary.creditCount || 0))} invoice{(summary.count + (summary.creditCount || 0)) !== 1 ? 's' : ''}
                    {summary.creditCount > 0 && <span className="text-amber-500 ml-1">({summary.creditCount} credit)</span>}
                    {(summary.returnCount || 0) > 0 && <span className="text-red-400 ml-1">({summary.returnCount} return)</span>}
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

                  {/* Return / Exchange — populated automatically from cashier's button choice at return time */}
                  {returnInvoices.length > 0 && (
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-700/40">
                      <div className="flex items-center gap-2.5 pl-4">
                        <div className="w-2 h-2 rounded-full bg-red-400" />
                        <span className="text-gray-400 text-sm">Return / Exchange</span>
                      </div>
                      <span className={`font-semibold tabular-nums text-sm ${exchangeAdj > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                        {exchangeAdj > 0 ? `(${fmt(exchangeAdj)})` : '—'}
                      </span>
                    </div>
                  )}

                  {/* Refund Only — populated automatically from cashier's button choice at return time */}
                  {returnInvoices.length > 0 && (
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-700/40">
                      <div className="flex items-center gap-2.5 pl-4">
                        <div className="w-2 h-2 rounded-full bg-orange-400" />
                        <span className="text-gray-400 text-sm">Refund Only</span>
                      </div>
                      <span className={`font-semibold tabular-nums text-sm ${refundOnlyTotal > 0 ? 'text-orange-400' : 'text-gray-600'}`}>
                        {refundOnlyTotal > 0 ? `(${fmt(refundOnlyTotal)})` : '—'}
                      </span>
                    </div>
                  )}

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

                  {/* Net Sales Value = Total Sales − Returns */}
                  <div className="flex items-center justify-between px-5 py-3.5 bg-blue-900/20 border-b border-blue-700/40">
                    <div className="flex items-center gap-2.5 pl-4">
                      <div className="w-2 h-2 rounded-full bg-blue-400" />
                      <span className="text-blue-300 text-sm font-semibold">Net Sales Value</span>
                    </div>
                    <span className="text-blue-300 font-bold tabular-nums text-sm">{fmt(netSalesValue)}</span>
                  </div>

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

                </div>{/* end left column */}

                {/* RIGHT COLUMN: Cashier Summary */}
                <div className="w-72 flex-shrink-0">

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

                  {posOpeningEntry ? (
                    <>
                      {/* Net Cash Collected (gross cash from sales minus change given) */}
                      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-700/60">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-green-600/20 flex items-center justify-center">
                            <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          </div>
                          <p className="text-gray-300 text-sm font-medium">Net Cash Collected</p>
                        </div>
                        <span className="font-semibold tabular-nums">
                          {hasBreakdown
                            ? <span className={netCashCollected < 0 ? 'text-red-400' : 'text-green-400'}>{fmt(netCashCollected)}</span>
                            : <span className="text-gray-600 text-sm">—</span>}
                        </span>
                      </div>

                      {/* Refund Paid — only for actual cash refunds from return invoices */}
                      {refundCashPaid > 0 && (
                        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700/40 bg-red-900/10">
                          <div className="flex items-center gap-2.5 pl-4">
                            <div className="w-2 h-2 rounded-full bg-red-400" />
                            <span className="text-red-300 text-sm">Refund Paid</span>
                          </div>
                          <span className="text-red-400 font-semibold tabular-nums text-sm">({fmt(refundCashPaid)})</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="px-5 py-4 text-center text-gray-600 text-xs">
                      Open a POS session to track cashier balance
                    </div>
                  )}

                  {/* Total Cash in Cashier — highlighted (only when session exists) */}
                  {posOpeningEntry && (
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
                  )}
                </div>
              </section>

                </div>{/* end right column */}
              </div>{/* end landscape wrapper */}
            </>
          )}


          {/* Close session error */}
          {closeErr && (
            <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm break-words">
              <p>{closeErr}</p>
              {closeErrRaw && (
                <button
                  onClick={copyErrorToClipboard}
                  className={`mt-2 text-xs px-3 py-1.5 rounded border transition-colors ${
                    copied
                      ? 'border-green-600 text-green-400 bg-green-900/20'
                      : 'border-red-600 text-red-400 hover:bg-red-900/30'
                  }`}
                >
                  {copied ? '✓ Copied to clipboard' : 'Copy full error details'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 pb-5 pt-3 border-t border-gray-700 flex-shrink-0">

          {/* Cache clear checkbox — shown before session close */}
          {posOpeningEntry && !closed && (
            <label className="flex items-center gap-2.5 cursor-pointer mb-3 select-none group">
              <div
                onClick={() => setClearCacheOnClose((v) => !v)}
                className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                  clearCacheOnClose ? 'bg-blue-600 border-blue-500' : 'bg-gray-700 border-gray-500 group-hover:border-gray-400'
                }`}
              >
                {clearCacheOnClose && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="text-gray-400 text-xs">Clear item cache after closing session</span>
            </label>
          )}

          <div className="flex gap-3">
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
    </div>
  )
}
