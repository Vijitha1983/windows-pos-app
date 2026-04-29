import { useEffect, useRef, useState } from 'react'
import { usePOSStore } from '../store/posStore'
import { createPOSInvoice, submitPOSInvoice, resolveGiftCardAccount } from '../services/api'
import { queueInvoice } from '../services/cache'

export default function PaymentModal() {
  const {
    paymentModal, closePaymentModal,
    posProfile, posProfileData,
    currentBill, getGrandTotal, getDiscountAmount,
    newBill, isOnline,
    posOpeningEntry,
  } = usePOSStore()

  const grandTotal  = getGrandTotal()
  const discountAmt = getDiscountAmount()

  const [payments,      setPayments]      = useState([])
  const [activeIdx,     setActiveIdx]     = useState(0)
  const [submitting,    setSubmitting]    = useState(false)
  const [error,         setError]         = useState('')
  const [changeOverlay, setChangeOverlay] = useState(null)
  const [giftVoucher,        setGiftVoucher]        = useState({ show: false, amount: '' })
  const [giftModeName,       setGiftModeName]       = useState('Gift Card')  // ERPNext Mode of Payment name
  const [giftAccount,        setGiftAccount]        = useState(null)         // resolved GL account (or null)
  const [giftAccResolving,   setGiftAccResolving]   = useState(false)
  const containerRef   = useRef(null)
  const inputRefs      = useRef([])
  const giftVoucherRef = useRef(null)

  // ── Init payment rows when modal opens ──────────────────────────────────
  useEffect(() => {
    if (!paymentModal) return

    const methods = posProfileData?.payments?.length
      ? posProfileData.payments
      : [{ mode_of_payment: 'Cash' }]

    const initial = methods.map((m, i) => ({
      mode:       m.mode_of_payment,
      amount:     i === 0 ? grandTotal : 0,
      autoFilled: false,
    }))
    setPayments(initial)
    setActiveIdx(0)
    setError('')
    setChangeOverlay(null)
    setGiftVoucher({ show: false, amount: '' })
    setGiftAccount(null)

    // Load gift card mode name from settings
    window.electronAPI.storeGet('giftModeName').then((name) => {
      setGiftModeName(name || 'Gift Card')
    })

    setTimeout(() => {
      containerRef.current?.focus()
      inputRefs.current[0]?.select()
    }, 60)
  }, [paymentModal])

  useEffect(() => {
    if (payments.length > 0) {
      setTimeout(() => inputRefs.current[activeIdx]?.select(), 30)
    }
  }, [activeIdx])

  // ── Computed totals ──────────────────────────────────────────────────────
  const giftAmt     = parseFloat(giftVoucher.amount) || 0
  const nonCashTotal = payments
    .filter((p) => !p.mode.toLowerCase().includes('cash'))
    .reduce((s, p) => s + p.amount, 0) + giftAmt
  const cashPayment = payments.find((p) => p.mode.toLowerCase().includes('cash'))
  const cashPaid    = cashPayment?.amount || 0
  const cashNeeded  = Math.max(0, grandTotal - nonCashTotal)
  const change      = cashPaid > cashNeeded ? parseFloat((cashPaid - cashNeeded).toFixed(2)) : 0

  const totalPaid     = payments.reduce((s, p) => s + p.amount, 0) + giftAmt
  const effectivePaid = totalPaid - change
  const balanceDue    = parseFloat(Math.max(0, grandTotal - effectivePaid).toFixed(2))
  const isFullyPaid   = balanceDue < 0.01

  // ── Keyboard handler ────────────────────────────────────────────────────
  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation()
      if (changeOverlay !== null) return   // ignore ESC during change display
      closePaymentModal()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation()
      if (!submitting && changeOverlay === null) handleConfirm()
      return
    }
    if (e.key === 'Tab' && changeOverlay === null) {
      e.preventDefault()
      setActiveIdx((i) => (i + 1) % payments.length)
      return
    }
    if (changeOverlay === null && document.activeElement?.tagName !== 'INPUT') {
      if (e.key.toLowerCase() === 'c') {
        const i = payments.findIndex((p) => p.mode.toLowerCase().includes('cash'))
        if (i >= 0) { e.preventDefault(); setActiveIdx(i) }
      }
      if (e.key.toLowerCase() === 'd') {
        const i = payments.findIndex((p) => p.mode.toLowerCase().includes('card'))
        if (i >= 0) { e.preventDefault(); setActiveIdx(i) }
      }
    }
  }

  // ── Gift card helpers ───────────────────────────────────────────────────
  async function enableGiftCard() {
    setGiftVoucher({ show: true, amount: '' })
    setGiftAccResolving(true)
    const company          = posProfileData?.company || ''
    const accountShortName = await window.electronAPI.storeGet('giftAccountShort') || ''
    const account = await resolveGiftCardAccount(giftModeName, company, accountShortName)
    setGiftAccount(account)
    setGiftAccResolving(false)
    setTimeout(() => giftVoucherRef.current?.focus(), 40)
  }

  function disableGiftCard() {
    setGiftVoucher({ show: false, amount: '' })
    setGiftAccount(null)
  }

  // ── Payment amount logic ────────────────────────────────────────────────
  function handleAmountChange(idx, rawValue) {
    const entered = parseFloat(rawValue) || 0
    const isCash  = payments[idx].mode.toLowerCase().includes('cash')

    setPayments((prev) => {
      let updated = prev.map((p, i) =>
        i === idx ? { ...p, amount: entered, autoFilled: false } : p
      )
      if (isCash) {
        const remaining = parseFloat((grandTotal - entered).toFixed(2))
        if (remaining > 0) {
          let filled = false
          updated = updated.map((p, i) => {
            if (i !== idx && !filled && !p.mode.toLowerCase().includes('cash')) {
              filled = true
              return { ...p, amount: remaining, autoFilled: true }
            }
            if (i !== idx && p.autoFilled) return { ...p, amount: 0, autoFilled: false }
            return p
          })
        } else {
          updated = updated.map((p, i) =>
            i !== idx && p.autoFilled ? { ...p, amount: 0, autoFilled: false } : p
          )
        }
      }
      return updated
    })
  }

  // ── Build ERPNext invoice payload ────────────────────────────────────────
  function buildInvoice() {
    const today     = new Date().toISOString().split('T')[0]
    const warehouse = posProfileData?.warehouse || ''
    // Use POS Profile's default customer so "Walk-in Customer" resolves correctly
    const defaultCustomer = posProfileData?.customer || 'Walk-in Customer'

    const items = currentBill.items.map((item) => ({
      item_code: item.item_code,
      item_name: item.item_name,
      qty:       item.qty,
      rate:      item.unitPrice,
      uom:       item.uom || 'Nos',
      warehouse,                   // required by stock controller
    }))

    // Pass full amounts — ERPNext calculates change_amount itself from overpayment
    const paymentEntries = [
      ...payments
        .map((p) => ({ mode_of_payment: p.mode, amount: p.amount }))
        .filter((p) => p.amount > 0),
      ...(giftAmt > 0 ? [{
        mode_of_payment: giftModeName,
        amount: giftAmt,
        ...(giftAccount ? { account: giftAccount } : {}),
      }] : []),
    ]

    const doc = {
      doctype:       'POS Invoice',
      pos_profile:   posProfile,
      company:       posProfileData?.company  || '',
      currency:      posProfileData?.currency || 'LKR',
      customer:      currentBill.customer?.name || defaultCustomer,
      posting_date:  today,
      set_warehouse: warehouse,
      items,
      payments:      paymentEntries,
    }

    // Link to the open POS session — required by ERPNext v14+ before submission
    if (posOpeningEntry) doc.pos_opening_entry = posOpeningEntry

    if (discountAmt > 0) {
      doc.apply_discount_on = 'Grand Total'
      doc.discount_amount   = discountAmt
    }

    return doc
  }

  // ── Build receipt HTML (80mm thermal-style) ──────────────────────────────
  function buildReceiptHtml(invoiceName) {
    const company    = posProfileData?.company || 'POS'
    const dateStr    = new Date().toLocaleString()
    const customer   = currentBill.customer?.customer_name
                       || posProfileData?.customer
                       || 'Walk-in Customer'

    const itemRows = currentBill.items.map((i) => `
      <tr>
        <td style="padding:2px 0;max-width:120px;overflow:hidden">${i.item_name}</td>
        <td style="text-align:right;padding:2px 6px;white-space:nowrap">${i.qty}&nbsp;×&nbsp;${fmt(i.unitPrice)}</td>
        <td style="text-align:right;padding:2px 0;white-space:nowrap">${fmt(i.total)}</td>
      </tr>`).join('')

    const allPayments = [
      ...payments.filter((p) => p.amount > 0),
      ...(giftAmt > 0 ? [{ mode: giftModeName, amount: giftAmt }] : []),
    ]
    const payRows = allPayments.map((p) => `
        <tr>
          <td style="padding:1px 0">${p.mode}</td>
          <td style="text-align:right;padding:1px 0">${fmt(p.amount)}</td>
        </tr>`).join('')

    return `<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:5mm}
        h1{font-size:14px;text-align:center;margin-bottom:2px}
        .c{text-align:center}
        .sep{border-top:1px dashed #000;margin:5px 0}
        table{width:100%;border-collapse:collapse}
        .tot td{font-weight:bold;font-size:14px;padding-top:3px}
        .chg td{font-style:italic}
        @media print{@page{margin:0;size:80mm auto}}
      </style>
    </head><body>
      <h1>${company}</h1>
      <p class="c" style="font-size:10px">${dateStr}</p>
      <p class="c" style="font-size:10px">${invoiceName}</p>
      <p class="c" style="font-size:10px">Customer: ${customer}</p>
      <div class="sep"></div>
      <table><thead>
        <tr>
          <th style="text-align:left">Item</th>
          <th style="text-align:right">Qty×Rate</th>
          <th style="text-align:right">Amt</th>
        </tr>
      </thead><tbody>${itemRows}</tbody></table>
      <div class="sep"></div>
      ${discountAmt > 0 ? `<table><tr><td>Discount</td><td style="text-align:right">- ${fmt(discountAmt)}</td></tr></table>` : ''}
      <table><tr class="tot"><td>TOTAL</td><td style="text-align:right">${fmt(grandTotal)}</td></tr></table>
      <div class="sep"></div>
      <table>${payRows}</table>
      ${change > 0 ? `<table><tr class="chg"><td>Change</td><td style="text-align:right">${fmt(change)}</td></tr></table>` : ''}
      <div class="sep"></div>
      <p class="c" style="margin-top:8px;font-size:11px">Thank you!</p>
    </body></html>`
  }

  async function printReceipt(invoiceName) {
    try {
      const html = buildReceiptHtml(invoiceName)
      if (window.electronAPI?.printReceipt) await window.electronAPI.printReceipt(html)
    } catch (e) {
      console.error('Print failed:', e)
    }
  }

  async function kickCashDrawer() {
    try {
      const port = await window.electronAPI?.storeGet('drawerPort')
      if (port && window.electronAPI?.openCashDrawer) await window.electronAPI.openCashDrawer(port)
    } catch (e) {
      console.error('Cash drawer failed:', e)
    }
  }

  function finishCheckout(changeAmt) {
    if (changeAmt > 0) {
      setChangeOverlay(changeAmt)
      setTimeout(() => {
        setChangeOverlay(null)
        closePaymentModal()
        newBill()
      }, 3000)
    } else {
      closePaymentModal()
      newBill()
    }
  }

  // ── Submit invoice ───────────────────────────────────────────────────────
  async function handleConfirm() {
    if (!isFullyPaid) {
      setError(`Balance due: ${fmt(balanceDue)} — add more payment`)
      return
    }
    setSubmitting(true)
    setError('')

    const invoiceData = buildInvoice()
    const changeAmt   = change   // capture current change before state clears

    try {
      if (!isOnline) throw new Error('offline')

      const draft = await createPOSInvoice(invoiceData)
      if (!draft?.name) throw new Error('Invoice created but no name returned')

      await submitPOSInvoice(draft.name)

      // Fire print + drawer in background — don't block checkout
      printReceipt(draft.name)
      kickCashDrawer()

      finishCheckout(changeAmt)
    } catch (err) {
      if (!isOnline || err.message === 'offline') {
        await queueInvoice(invoiceData)
        // Offline: still kick drawer (cash sale), skip print
        kickCashDrawer()
        finishCheckout(changeAmt)
      } else {
        const msg =
          err?.response?.data?.exc ||
          err?.response?.data?.message ||
          err?.message ||
          'Submission failed'
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const fmt = (n) => parseFloat(n || 0).toFixed(2)

  if (!paymentModal) return null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      {/* ── Change overlay — shown for 3 s after checkout when overpaid ── */}
      {changeOverlay !== null && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[60]">
          <div className="bg-gray-800 border-2 border-yellow-600 rounded-3xl px-16 py-12 text-center shadow-2xl">
            <p className="text-yellow-400 text-sm font-semibold uppercase tracking-widest mb-3">Change to Return</p>
            <p className="text-yellow-300 font-bold tabular-nums" style={{ fontSize: '5rem', lineHeight: 1 }}>
              {fmt(changeOverlay)}
            </p>
            <p className="text-gray-600 text-xs mt-6">Returning to new bill…</p>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-600 outline-none"
      >
        <>

            {/* ── Header ──────────────────────────────────────── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <div>
                <h2 className="text-white font-bold text-xl">Checkout</h2>
                {currentBill.customer && (
                  <p className="text-blue-300 text-xs mt-0.5">{currentBill.customer.customer_name}</p>
                )}
              </div>
              <button onClick={closePaymentModal} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>

            {/* ── Bill total ──────────────────────────────────── */}
            <div className="px-6 py-4 bg-gray-900/40 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Bill Total</span>
                <span className="text-white font-bold text-3xl tabular-nums">{fmt(grandTotal)}</span>
              </div>
              {discountAmt > 0 && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-gray-500 text-xs">Discount applied</span>
                  <span className="text-red-400 text-xs tabular-nums">− {fmt(discountAmt)}</span>
                </div>
              )}
            </div>

            {/* ── Payment method rows ─────────────────────────── */}
            <div className="px-6 py-4 space-y-3">
              {payments.map((p, idx) => {
                const isCash   = p.mode.toLowerCase().includes('cash')
                const isCard   = p.mode.toLowerCase().includes('card')
                const isGift   = !isCash && !isCard && (
                  p.mode.toLowerCase().includes('gift') ||
                  p.mode.toLowerCase().includes('voucher') ||
                  p.mode === giftModeName
                )
                const isActive = activeIdx === idx

                return (
                  <div
                    key={p.mode}
                    onClick={() => { setActiveIdx(idx); inputRefs.current[idx]?.select() }}
                    className={`rounded-xl border-2 transition-all cursor-pointer overflow-hidden ${
                      isActive
                        ? 'border-blue-500 bg-blue-900/20'
                        : 'border-gray-700 bg-gray-700/30 hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isCash ? 'bg-green-800/60' : isCard ? 'bg-blue-800/60' : isGift ? 'bg-purple-800/60' : 'bg-gray-600/60'
                      }`}>
                        {isCash ? (
                          <svg className="w-4 h-4 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        ) : isCard ? (
                          <svg className="w-4 h-4 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                          </svg>
                        ) : isGift ? (
                          <svg className="w-4 h-4 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-white text-sm font-semibold">{p.mode}</span>
                          {p.autoFilled && (
                            <span className="text-xs bg-amber-900/50 text-amber-300 px-1.5 py-0 rounded">auto</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {isCash ? 'Key: C' : isCard ? 'Key: D' : ''}
                          {isCash && change > 0 && (
                            <span className="ml-2 text-yellow-400">Cash handed: {fmt(cashPaid)}</span>
                          )}
                        </div>
                      </div>

                      <input
                        ref={(el) => (inputRefs.current[idx] = el)}
                        type="number"
                        min="0"
                        step="0.01"
                        value={p.amount === 0 ? '' : p.amount}
                        placeholder="0.00"
                        onChange={(e) => handleAmountChange(idx, e.target.value)}
                        onFocus={() => setActiveIdx(idx)}
                        onKeyDown={(e) => {
                          // Let Enter bubble up to container handler
                          if (e.key === 'Enter') return
                        }}
                        className={`w-32 rounded-lg px-3 py-2 text-right font-bold text-base focus:outline-none tabular-nums ${
                          isActive
                            ? 'bg-gray-700 border-2 border-blue-500 text-white'
                            : 'bg-gray-700/60 border border-gray-600 text-gray-200'
                        } ${p.autoFilled ? 'text-amber-300' : ''}`}
                      />
                    </div>
                  </div>
                )
              })}

              {/* ── Gift Card ────────────────────────────────── */}
              {giftVoucher.show ? (
                <div className="rounded-xl border-2 border-purple-600 bg-purple-900/15 overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-800/60 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-white text-sm font-semibold">{giftModeName}</span>
                      <div className="text-xs mt-0.5 truncate">
                        {giftAccResolving
                          ? <span className="text-gray-500">Resolving account…</span>
                          : giftAccount
                            ? <span className="text-green-500">{giftAccount}</span>
                            : <span className="text-amber-400">Account not found — set in Settings → Payment Methods</span>}
                      </div>
                    </div>
                    <input
                      ref={giftVoucherRef}
                      type="number"
                      min="0"
                      step="0.01"
                      value={giftVoucher.amount}
                      placeholder="0.00"
                      onChange={(e) => setGiftVoucher((g) => ({ ...g, amount: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') return }}
                      className="w-32 rounded-lg px-3 py-2 text-right font-bold text-base focus:outline-none tabular-nums bg-gray-700 border-2 border-purple-500 text-purple-200"
                    />
                    <button
                      type="button"
                      onClick={disableGiftCard}
                      className="ml-1 text-gray-600 hover:text-red-400 text-lg leading-none flex-shrink-0"
                    >×</button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={enableGiftCard}
                  className="w-full flex items-center justify-center gap-2 border border-dashed border-purple-700 hover:border-purple-500 text-purple-500 hover:text-purple-300 rounded-xl py-2.5 text-sm transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                  </svg>
                  Apply {giftModeName}
                </button>
              )}
            </div>

            {/* ── Summary ──────────────────────────────────────── */}
            <div className="px-6 pb-2 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">Total Received</span>
                <span className={`font-semibold tabular-nums ${
                  effectivePaid >= grandTotal ? 'text-green-400' : 'text-gray-300'
                }`}>{fmt(totalPaid)}</span>
              </div>

              {change > 0 && (
                <div className="flex items-center justify-between bg-yellow-900/30 border border-yellow-700 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-yellow-300 text-xs font-semibold uppercase tracking-wider">Change to Return</p>
                    <p className="text-yellow-400 text-xs mt-0.5 opacity-70">Give back to customer</p>
                  </div>
                  <span className="text-yellow-300 font-bold text-2xl tabular-nums">{fmt(change)}</span>
                </div>
              )}

              {balanceDue > 0.01 && (
                <div className="flex items-center justify-between bg-red-900/30 border border-red-700 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-red-300 text-xs font-semibold uppercase tracking-wider">Balance Due</p>
                    <p className="text-red-400 text-xs mt-0.5 opacity-70">Still to be collected</p>
                  </div>
                  <span className="text-red-300 font-bold text-2xl tabular-nums">{fmt(balanceDue)}</span>
                </div>
              )}

              {isFullyPaid && change === 0 && (
                <div className="flex items-center justify-center gap-2 bg-green-900/20 border border-green-800/50 rounded-lg px-4 py-2">
                  <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-green-400 text-sm font-medium">Exact amount — ready to confirm</span>
                </div>
              )}
            </div>

            {error && (
              <div className="mx-6 mb-2 bg-red-900/40 border border-red-700 rounded-lg px-4 py-2.5 text-red-300 text-sm break-words">
                {error}
              </div>
            )}

            {/* ── Confirm button ────────────────────────────────── */}
            <div className="px-6 pb-5 pt-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting || !isFullyPaid}
                className="w-full bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-colors text-lg"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Submitting…
                  </span>
                ) : (
                  `Confirm  ·  ${fmt(grandTotal)}`
                )}
              </button>
              <p className="text-center text-xs text-gray-600 mt-2">Enter to confirm · ESC to cancel · Tab to switch</p>
            </div>
          </>
      </div>
    </div>
  )
}
