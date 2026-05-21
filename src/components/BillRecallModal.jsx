import { useEffect, useRef, useState } from 'react'
import { usePOSStore } from '../store/posStore'
import { getRecentPOSInvoices, searchAllPOSInvoices, getPOSInvoiceDetail } from '../services/api'

export default function BillRecallModal({ onClose }) {
  const { posProfile } = usePOSStore()

  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState([])
  const [selected, setSelected] = useState(null)   // invoice name
  const [detail,   setDetail]   = useState(null)   // full invoice doc
  const [loading,  setLoading]  = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const searchRef  = useRef(null)
  const debounce   = useRef(null)

  // Load recent on open
  useEffect(() => {
    searchRef.current?.focus()
    loadRecent()
  }, [])

  // Debounced search
  useEffect(() => {
    clearTimeout(debounce.current)
    if (!query.trim()) { loadRecent(); return }
    debounce.current = setTimeout(doSearch, 350)
    return () => clearTimeout(debounce.current)
  }, [query])

  // Load detail when selection changes
  useEffect(() => {
    if (!selected) { setDetail(null); return }
    let cancelled = false
    setDetailLoading(true)
    setDetail(null)
    getPOSInvoiceDetail(selected)
      .then((doc) => { if (!cancelled) setDetail(doc) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [selected])

  async function loadRecent() {
    setLoading(true)
    try { setResults(await getRecentPOSInvoices(posProfile)) } catch {}
    setLoading(false)
  }

  async function doSearch() {
    setLoading(true)
    try { setResults(await searchAllPOSInvoices(query.trim(), posProfile)) } catch {}
    setLoading(false)
  }

  async function handleReprint() {
    if (!detail) return
    setPrinting(true)
    try {
      const [billHeader, billFooter, billHeaderImage, billFooterImage, receiptPrinter] = await Promise.all([
        window.electronAPI.storeGet('billHeader').catch(() => ''),
        window.electronAPI.storeGet('billFooter').catch(() => ''),
        window.electronAPI.storeGet('billHeaderImage').catch(() => null),
        window.electronAPI.storeGet('billFooterImage').catch(() => null),
        window.electronAPI.storeGet('receiptPrinter').catch(() => ''),
      ])
      const html = buildReceiptHtml(detail, billHeader || '', billFooter || '', billHeaderImage, billFooterImage)
      if (window.electronAPI?.printReceipt) await window.electronAPI.printReceipt(html, receiptPrinter || undefined)
    } catch (e) {
      console.error('Reprint failed:', e)
    }
    setPrinting(false)
  }

  const fmt = (n) => parseFloat(n || 0).toFixed(2)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl border border-gray-700 flex flex-col" style={{ height: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-white font-bold text-lg">Bill Recall</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">

          {/* ── Left: search + list ── */}
          <div className="w-72 flex-shrink-0 flex flex-col border-r border-gray-700">
            <div className="px-3 py-2 border-b border-gray-700 flex-shrink-0">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search invoice # or customer…"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-700/50">
              {loading ? (
                <div className="text-gray-500 text-sm text-center py-8">Loading…</div>
              ) : results.length === 0 ? (
                <div className="text-gray-600 text-sm text-center py-8">No invoices found</div>
              ) : results.map((inv) => (
                <button
                  key={inv.name}
                  onClick={() => setSelected(inv.name)}
                  className={`w-full text-left px-4 py-2.5 transition-colors ${
                    selected === inv.name ? 'bg-blue-900/50' : 'hover:bg-gray-700/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-mono font-semibold truncate ${inv.is_return ? 'text-red-400' : 'text-white'}`}>
                      {inv.name}
                    </span>
                    {inv.is_return && (
                      <span className="text-[9px] bg-red-900/60 text-red-300 px-1 rounded flex-shrink-0">RTN</span>
                    )}
                  </div>
                  <div className="flex justify-between items-center mt-0.5">
                    <span className="text-gray-400 text-xs truncate">{inv.customer_name || '—'}</span>
                    <span className={`text-xs font-bold tabular-nums flex-shrink-0 ml-2 ${inv.is_return ? 'text-red-400' : 'text-green-400'}`}>
                      {fmt(inv.grand_total)}
                    </span>
                  </div>
                  <div className="text-gray-600 text-[10px] mt-0.5">
                    {inv.posting_date}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Right: detail ── */}
          <div className="flex-1 flex flex-col min-w-0">
            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Loading invoice…</div>
            ) : !detail ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-2">
                <svg className="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm">Select an invoice to view</span>
              </div>
            ) : (
              <>
                {/* Detail content */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

                  {/* Invoice meta */}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className={`font-bold text-lg ${detail.is_return ? 'text-red-400' : 'text-white'}`}>
                        {detail.name}
                        {detail.is_return && <span className="ml-2 text-xs bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded">RETURN</span>}
                      </p>
                      <p className="text-gray-400 text-sm">{detail.customer_name}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{detail.posting_date}  {detail.posting_time?.slice(0,5)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-400 text-xs">Grand Total</p>
                      <p className={`font-bold text-2xl tabular-nums ${detail.is_return ? 'text-red-400' : 'text-green-400'}`}>
                        {fmt(detail.grand_total)}
                      </p>
                    </div>
                  </div>

                  {/* Items */}
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wide mb-1.5">Items</p>
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-gray-700 text-gray-400 text-xs">
                          <th className="text-left pb-1.5 font-medium">Item</th>
                          <th className="text-right pb-1.5 font-medium w-12">Qty</th>
                          <th className="text-right pb-1.5 font-medium w-20">Rate</th>
                          <th className="text-right pb-1.5 font-medium w-24">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detail.items || []).map((item, i) => (
                          <tr key={i} className="border-b border-gray-700/40">
                            <td className="py-1.5">
                              <div className="text-white text-xs font-medium leading-snug">{item.item_name}</div>
                              <div className="text-gray-500 text-[10px]">{item.item_code}</div>
                            </td>
                            <td className="py-1.5 text-right text-gray-300 text-xs tabular-nums">{item.qty}</td>
                            <td className="py-1.5 text-right text-gray-300 text-xs tabular-nums">{fmt(item.rate)}</td>
                            <td className="py-1.5 text-right text-white font-semibold text-xs tabular-nums">{fmt(item.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals */}
                  <div className="space-y-1 border-t border-gray-700 pt-3">
                    <div className="flex justify-between text-sm text-gray-400">
                      <span>Sub Total</span>
                      <span className="tabular-nums">{fmt(detail.net_total ?? detail.total)}</span>
                    </div>
                    {(detail.discount_amount > 0 || detail.additional_discount_percentage > 0) && (
                      <div className="flex justify-between text-sm text-red-400">
                        <span>Discount</span>
                        <span className="tabular-nums">− {fmt(detail.discount_amount)}</span>
                      </div>
                    )}
                    {(detail.total_taxes_and_charges > 0) && (
                      <div className="flex justify-between text-sm text-gray-400">
                        <span>Tax</span>
                        <span className="tabular-nums">{fmt(detail.total_taxes_and_charges)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-base border-t border-gray-600 pt-2">
                      <span className="text-white">Grand Total</span>
                      <span className={`tabular-nums ${detail.is_return ? 'text-red-400' : 'text-green-400'}`}>
                        {fmt(detail.grand_total)}
                      </span>
                    </div>
                  </div>

                  {/* Payments */}
                  {detail.payments?.length > 0 && (
                    <div>
                      <p className="text-gray-500 text-xs uppercase tracking-wide mb-1.5">Payments</p>
                      <div className="space-y-1">
                        {detail.payments.filter((p) => p.amount > 0).map((p, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-gray-300">{p.mode_of_payment}</span>
                            <span className="text-white tabular-nums font-medium">{fmt(p.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>

                {/* Action bar */}
                <div className="flex-shrink-0 px-6 py-4 border-t border-gray-700 flex items-center gap-3">
                  <button
                    onClick={handleReprint}
                    disabled={printing}
                    className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    {printing ? 'Printing…' : 'Reprint Receipt'}
                  </button>
                  <span className="text-gray-600 text-xs">View only — no changes</span>
                </div>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

function buildReceiptHtml(doc, billHeader, billFooter, billHeaderImage, billFooterImage) {
  const fmt   = (n) => parseFloat(n || 0).toFixed(2)
  const items = (doc.items || []).map((i) => `
    <tr>
      <td colspan="4" style="padding:2px 0;font-weight:500">${i.item_name}</td>
    </tr>
    <tr style="font-size:11px">
      <td style="padding:1px 0;width:22px;text-align:right">${i.qty}</td>
      <td style="padding:1px 6px;text-align:right">${fmt(i.rate)}</td>
      <td style="padding:1px 6px;text-align:right"></td>
      <td style="padding:1px 0;text-align:right;font-weight:bold">${fmt(i.amount)}</td>
    </tr>`).join('')

  const payRows = (doc.payments || []).filter((p) => p.amount > 0).map((p) => `
    <tr><td>${p.mode_of_payment}</td><td style="text-align:right">${fmt(p.amount)}</td></tr>`).join('')

  const toHtml = (s) => (!s ? '' : s.includes('<') ? s : s.replace(/\n/g, '<br>'))
  const headerImgHtml = billHeaderImage
    ? `<div style="text-align:center;margin-bottom:8px"><img src="${billHeaderImage}" style="max-width:100%;max-height:44mm;object-fit:contain" /></div>`
    : ''
  const headerTxtHtml = billHeader
    ? `<div style="text-align:center;margin-bottom:8px;line-height:1.5;font-size:32px">${toHtml(billHeader)}</div>`
    : ''
  const footerTxtHtml = billFooter
    ? `<div style="text-align:center;margin-top:10px;line-height:1.5;font-size:28px">${toHtml(billFooter)}</div>`
    : ''
  const footerImgHtml = billFooterImage
    ? `<div style="text-align:center;margin-top:6px"><img src="${billFooterImage}" style="max-width:100%;max-height:30mm;object-fit:contain" /></div>`
    : ''

  return `<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=800">
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;font-size:38px;width:100%;padding:4mm}
      .sep{border-top:1px dashed #000;margin:5px 0}
      table{width:100%;border-collapse:collapse}
      .tot td{font-weight:bold;font-size:14px;padding-top:3px}
      @page{margin:0;size:80mm auto}
    </style>
  </head><body>
    ${headerImgHtml}${headerTxtHtml}
    <p style="text-align:center;font-size:10px">${doc.posting_date} ${(doc.posting_time || '').slice(0,5)}</p>
    <p style="text-align:center;font-size:10px">${doc.name}</p>
    <p style="text-align:center;font-size:10px">Customer: ${doc.customer_name || 'Walk-in Customer'}</p>
    <div class="sep"></div>
    <table><thead>
      <tr style="font-size:10px;border-bottom:1px solid #000">
        <th style="text-align:right;width:22px">Qty</th>
        <th style="text-align:right">Rate</th>
        <th style="text-align:right">Disc.</th>
        <th style="text-align:right">Amt</th>
      </tr>
    </thead><tbody>${items}</tbody></table>
    <div class="sep"></div>
    ${doc.discount_amount > 0 ? `<table><tr><td>Discount</td><td style="text-align:right">- ${fmt(doc.discount_amount)}</td></tr></table>` : ''}
    <table><tr class="tot"><td>TOTAL</td><td style="text-align:right">${fmt(doc.grand_total)}</td></tr></table>
    <div class="sep"></div>
    <table>${payRows}</table>
    <div class="sep"></div>
    ${footerTxtHtml}${footerImgHtml}
  </body></html>`
}
