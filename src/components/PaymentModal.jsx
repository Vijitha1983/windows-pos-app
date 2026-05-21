import { useEffect, useRef, useState } from 'react'
import { usePOSStore } from '../store/posStore'
import { createPOSInvoice, submitPOSInvoice, createSalesInvoice, submitSalesInvoice, resolveGiftCardAccount, validateGiftVoucherSerial, searchDeliveredSerialNos, markSerialNoUsed, getApplicableTaxes, getItemTaxTemplates } from '../services/api'
import { queueInvoice, cacheGetPersist, cacheSetPersist } from '../services/cache'

export default function PaymentModal() {
  const {
    paymentModal, closePaymentModal,
    posProfile, posProfileData,
    currentBill, getGrandTotal, getDiscountAmount,
    newBill, isOnline,
    posOpeningEntry,
    billPaymentType, setBillPaymentType,
    addSoldToSession,
    returnCredit, returnInvoiceName, clearReturnCredit,
    username, userFullName,
  } = usePOSStore()

  const grandTotal  = getGrandTotal()
  const discountAmt = getDiscountAmount()

  const [payments,      setPayments]      = useState([])
  const [activeIdx,     setActiveIdx]     = useState(0)
  const [submitting,    setSubmitting]    = useState(false)
  const [error,         setError]         = useState('')
  const [changeOverlay, setChangeOverlay] = useState(null)
  const [giftRows,           setGiftRows]           = useState([])           // [{id,serial,amount,status,serialData}]
  const [giftModeName,       setGiftModeName]       = useState('Gift Card')  // ERPNext Mode of Payment name
  const [giftAccount,        setGiftAccount]        = useState(null)         // resolved GL account (or null)
  const [giftAccResolving,   setGiftAccResolving]   = useState(false)
  const [cashAccount,        setCashAccount]        = useState(null)         // GL account for cash payments
  const [bankAccount,        setBankAccount]        = useState(null)         // GL account for card/bank payments
  const [kokoAccount,        setKokoAccount]        = useState(null)         // GL account for Koko Pay
  const containerRef      = useRef(null)
  const inputRefs         = useRef([])
  const giftRowSerialRefs = useRef({})   // rowId → input element

  const [giftSuggestRowId,  setGiftSuggestRowId]   = useState(null)  // which row has the open autocomplete
  const [giftActiveSerial,  setGiftActiveSerial]   = useState('')    // serial being typed (drives debounce)
  const [serialSuggestions, setSerialSuggestions]  = useState([])
  const [serialDropIdx,     setSerialDropIdx]      = useState(0)
  const serialDebounce  = useRef(null)
  const prefetchedTax   = useRef({ ready: false, taxInfo: null, itemTaxMap: {} })

  // Derive lowercase version for comparisons; driven by store so header F8 stays in sync
  const paymentType    = billPaymentType === 'Credit' ? 'credit' : 'cash'
  const setPaymentType = (t) => setBillPaymentType(t === 'credit' ? 'Credit' : 'Cash')

  // ── Init payment rows when modal opens ──────────────────────────────────
  useEffect(() => {
    if (!paymentModal) return

    const methods = posProfileData?.payments?.length
      ? [...posProfileData.payments]
      : [{ mode_of_payment: 'Cash' }]

    // Always include Cash even if not in POS Profile
    if (!methods.some((m) => m.mode_of_payment.toLowerCase().includes('cash'))) {
      methods.unshift({ mode_of_payment: 'Cash' })
    }

    const initialNet = Math.max(0, grandTotal - (parseFloat(returnCredit) || 0))
    const initial = methods.map((m, i) => ({
      mode:       m.mode_of_payment,
      amount:     i === 0 ? initialNet : 0,
      autoFilled: false,
    }))
    setPayments(initial)
    setActiveIdx(0)
    setError('')
    setChangeOverlay(null)
    setGiftRows([])
    setGiftAccount(null)
    setGiftSuggestRowId(null)
    setGiftActiveSerial('')
    setSerialSuggestions([])
    setSerialDropIdx(0)

    // Load account settings
    window.electronAPI.storeGet('giftModeName').then((name) => setGiftModeName(name || 'Gift Card'))
    window.electronAPI.storeGet('cashAccount').then((v) => setCashAccount(v || null))
    window.electronAPI.storeGet('bankAccount').then((v) => setBankAccount(v || null))
    window.electronAPI.storeGet('kokoAccount').then((v) => setKokoAccount(v || null))

    // Pre-fetch tax info in the background while the cashier enters payment amounts,
    // so the Confirm button submits immediately instead of waiting for two API calls.
    prefetchedTax.current = { ready: false, taxInfo: null, itemTaxMap: {} }
    const _company     = posProfileData?.company || ''
    const _taxCategory = currentBill.customer?.tax_category || posProfileData?.tax_category || ''
    const _codes       = [...new Set(currentBill.items.map((i) => i.item_code))]
    Promise.all([
      _taxCategory ? getApplicableTaxes(_company, _taxCategory) : Promise.resolve(null),
      getItemTaxTemplates(_codes),
    ]).then(([tax, itemTax]) => {
      prefetchedTax.current = { ready: true, taxInfo: tax, itemTaxMap: itemTax || {} }
    }).catch(() => {
      prefetchedTax.current = { ready: true, taxInfo: null, itemTaxMap: {} }
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

  // Debounced autocomplete search for delivered gift voucher serials (active row)
  useEffect(() => {
    clearTimeout(serialDebounce.current)
    const activeRow = giftSuggestRowId ? giftRows.find((r) => r.id === giftSuggestRowId) : null
    if (!giftActiveSerial.trim() || activeRow?.status === 'valid') {
      setSerialSuggestions([])
      return
    }
    serialDebounce.current = setTimeout(async () => {
      try {
        const results = await searchDeliveredSerialNos(giftActiveSerial.trim())
        setSerialSuggestions(results)
        setSerialDropIdx(0)
      } catch {
        setSerialSuggestions([])
      }
    }, 220)
    return () => clearTimeout(serialDebounce.current)
  }, [giftActiveSerial])

  // When any gift row amount changes, auto-reduce cash so cash + gifts + return = net total.
  const _totalGiftForEffect = giftRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  useEffect(() => {
    if (giftRows.length === 0) return
    const gift   = _totalGiftForEffect
    const retAmt = parseFloat(returnCredit) || 0
    const net    = Math.max(0, grandTotal - retAmt)
    setPayments((prev) => {
      const cardTotal = prev
        .filter((p) => !p.mode.toLowerCase().includes('cash'))
        .reduce((s, p) => s + p.amount, 0)
      const cashNeeded = Math.max(0, parseFloat((net - cardTotal - gift).toFixed(2)))
      return prev.map((p) =>
        p.mode.toLowerCase().includes('cash') ? { ...p, amount: cashNeeded, autoFilled: gift > 0 } : p
      )
    })
  }, [_totalGiftForEffect])

  // ── Computed totals ──────────────────────────────────────────────────────
  const giftAmt      = giftRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const returnAmt    = parseFloat(returnCredit) || 0
  // grandTotal after deducting any return credit
  const netTotal     = Math.max(0, parseFloat((grandTotal - returnAmt).toFixed(2)))
  // When return credit exceeds the new bill, cashier must give back the difference in cash
  const returnOverpay = parseFloat(Math.max(0, returnAmt - grandTotal).toFixed(2))

  const nonCashTotal = payments
    .filter((p) => !p.mode.toLowerCase().includes('cash'))
    .reduce((s, p) => s + p.amount, 0) + giftAmt
  const cashPayment = payments.find((p) => p.mode.toLowerCase().includes('cash'))
  const cashPaid    = cashPayment?.amount || 0
  const cashNeeded  = Math.max(0, netTotal - nonCashTotal)
  const change      = cashPaid > cashNeeded ? parseFloat((cashPaid - cashNeeded).toFixed(2)) : 0
  // Total change to hand back: cash change + return credit surplus
  const totalChange   = parseFloat((change + returnOverpay).toFixed(2))

  const totalPaid     = payments.reduce((s, p) => s + p.amount, 0) + giftAmt + returnAmt
  const effectivePaid = totalPaid - totalChange
  const balanceDue    = parseFloat(Math.max(0, grandTotal - effectivePaid).toFixed(2))

  // Credit mode: requires a real named customer — not null and not the Walk-in default
  const defaultCustomer = posProfileData?.customer || 'Walk-in Customer'
  const creditCustomerValid = paymentType === 'credit' &&
    !!currentBill.customer &&
    currentBill.customer.name !== defaultCustomer &&
    currentBill.customer.customer_name?.toLowerCase() !== 'walk-in customer'
  // Fully paid when: credit mode with valid customer, OR cash mode where balance = 0
  // Return credit alone can cover the full bill (netTotal = 0)
  const isFullyPaid = paymentType === 'credit' ? creditCustomerValid : balanceDue < 0.01

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
    if (e.key === 'F8' && changeOverlay === null) {
      e.preventDefault()
      setPaymentType((t) => t === 'cash' ? 'credit' : 'cash')
      return
    }
    if (changeOverlay === null) {
      // Allow shortcuts even when a number input is focused (letters are ignored by number inputs).
      // Suppress shortcuts when a text input (serial number field) is active.
      const inText = document.activeElement?.tagName === 'INPUT' && document.activeElement?.type === 'text'
      if (!inText && e.key.toLowerCase() === 'c') {
        const i = payments.findIndex((p) => p.mode.toLowerCase().includes('cash'))
        if (i >= 0) { e.preventDefault(); setActiveIdx(i) }
      }
      if (!inText && e.key.toLowerCase() === 'd') {
        const i = payments.findIndex((p) => p.mode.toLowerCase().includes('card'))
        if (i >= 0) { e.preventDefault(); setActiveIdx(i) }
      }
      if (!inText && e.key.toLowerCase() === 'k') {
        const i = payments.findIndex((p) => p.mode.toLowerCase().includes('koko'))
        if (i >= 0) { e.preventDefault(); setActiveIdx(i) }
      }
      if (!inText && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        if (giftRows.length === 0) enableGiftCard()
        else addGiftRow()
      }
    }
  }

  // ── Gift card helpers ───────────────────────────────────────────────────
  function newGiftRowId() { return Math.random().toString(36).slice(2, 9) }

  async function resolveGiftAccount() {
    const fromProfile = posProfileData?.gift_card
    if (fromProfile) { setGiftAccount(fromProfile); return }
    const storedAccount = await window.electronAPI.storeGet('giftAccount') || ''
    if (storedAccount) { setGiftAccount(storedAccount); return }
    setGiftAccResolving(true)
    const company = posProfileData?.company || ''
    const account = await resolveGiftCardAccount(giftModeName, company, '')
    setGiftAccount(account)
    setGiftAccResolving(false)
  }

  async function enableGiftCard() {
    const id = newGiftRowId()
    setGiftRows([{ id, serial: '', amount: '', status: null, serialData: null }])
    await resolveGiftAccount()
    setTimeout(() => giftRowSerialRefs.current[id]?.focus(), 40)
  }

  function addGiftRow() {
    const id = newGiftRowId()
    setGiftRows((prev) => [...prev, { id, serial: '', amount: '', status: null, serialData: null }])
    setTimeout(() => giftRowSerialRefs.current[id]?.focus(), 40)
  }

  function removeGiftRow(rowId) {
    setGiftRows((prev) => prev.filter((r) => r.id !== rowId))
    if (giftSuggestRowId === rowId) { setSerialSuggestions([]); setGiftSuggestRowId(null) }
  }

  function disableGiftCard() {
    setGiftRows([])
    setGiftAccount(null)
    setGiftSuggestRowId(null)
    setGiftActiveSerial('')
    setSerialSuggestions([])
    setSerialDropIdx(0)
    // Restore cash to cover the net total (after return credit) again
    const retAmt = parseFloat(returnCredit) || 0
    const net    = Math.max(0, grandTotal - retAmt)
    setPayments((prev) => {
      const cardTotal = prev
        .filter((p) => !p.mode.toLowerCase().includes('cash'))
        .reduce((s, p) => s + p.amount, 0)
      const cashNeeded = Math.max(0, parseFloat((net - cardTotal).toFixed(2)))
      return prev.map((p) =>
        p.mode.toLowerCase().includes('cash') ? { ...p, amount: cashNeeded, autoFilled: false } : p
      )
    })
  }

  function parseDenomination(itemName) {
    if (!itemName) return null
    const match = (itemName || '').replace(/,/g, '').match(/[\d]+\.?\d*/)
    if (!match) return null
    const n = parseFloat(match[0])
    return isNaN(n) || n <= 0 ? null : n
  }

  async function validateSerial(rowId, serial) {
    const s = serial.trim()
    if (!s) return
    setSerialSuggestions([])
    setGiftRows((prev) => prev.map((r) => r.id === rowId ? { ...r, status: 'checking', serialData: null } : r))
    try {
      const data = await validateGiftVoucherSerial(s)
      const today = new Date().toISOString().split('T')[0]
      let status = 'invalid'
      if (data.status !== 'Delivered') {
        status = 'invalid'
      } else if (data.warranty_expiry_date && data.warranty_expiry_date < today) {
        status = 'expired'
      } else {
        status = 'valid'
      }
      setGiftRows((prev) => prev.map((r) => {
        if (r.id !== rowId) return r
        const denom = status === 'valid' && !r.amount ? parseDenomination(data.item_name) : null
        return { ...r, status, serialData: data, ...(denom ? { amount: String(denom) } : {}) }
      }))
    } catch {
      setGiftRows((prev) => prev.map((r) => r.id === rowId ? { ...r, status: 'invalid', serialData: null } : r))
    }
  }

  // ── Payment amount logic ────────────────────────────────────────────────
  function handleAmountChange(idx, rawValue) {
    const entered = parseFloat(rawValue) || 0
    const isCash  = payments[idx].mode.toLowerCase().includes('cash')

    setPayments((prev) => {
      const updated = prev.map((p, i) =>
        i === idx ? { ...p, amount: entered, autoFilled: false } : p
      )
      if (!isCash) {
        // Non-cash changed: auto-adjust cash to cover whatever is still owed
        const nonCashTotal = updated
          .filter((p) => !p.mode.toLowerCase().includes('cash'))
          .reduce((s, p) => s + p.amount, 0)
        const currentGift  = giftRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
        const retAmt       = parseFloat(returnCredit) || 0
        const net          = Math.max(0, grandTotal - retAmt)
        const cashNeeded   = Math.max(0, parseFloat((net - nonCashTotal - currentGift).toFixed(2)))
        return updated.map((p) =>
          p.mode.toLowerCase().includes('cash')
            ? { ...p, amount: cashNeeded, autoFilled: cashNeeded > 0 }
            : p
        )
      }
      // Cash changed: just set it directly — change will show if customer overpays
      return updated
    })
  }

  // ── Build ERPNext invoice payload ────────────────────────────────────────
  function buildInvoice(changeAmt = 0, taxInfo = null, itemTaxMap = {}) {
    const today     = new Date().toISOString().split('T')[0]
    const warehouse = posProfileData?.warehouse || ''
    // Use POS Profile's default customer so "Walk-in Customer" resolves correctly
    const defaultCustomer = posProfileData?.customer || 'Walk-in Customer'

    const items = currentBill.items.map((item) => {
      const entry = {
        item_code: item.item_code,
        item_name: (item.item_name || '').replace(/\s*\[FREE\]$/i, ''),
        qty:       item.qty,
        rate:      item.unitPrice,
        uom:       item.uom || 'Nos',
        warehouse,
      }
      if (item.isFreePromo) {
        entry.is_free_item       = 1
        entry.rate               = 0
        entry.discount_percentage = 100
      }
      if (item.serial_no) entry.serial_no = item.serial_no
      if (item.batch_no)  entry.batch_no  = item.batch_no
      // Item-level tax template (India GST / per-item tax compliance)
      const itemTpl = itemTaxMap?.[item.item_code]
      if (itemTpl) entry.item_tax_template = itemTpl
      return entry
    })

    // Payment entries carry the full tendered amounts; change_amount tells ERPNext
    // how much was returned so the GL books the net received figure only.
    const paymentEntries = [
      ...payments
        .map((p) => {
          const isCash = p.mode.toLowerCase().includes('cash')
          const isCard = p.mode.toLowerCase().includes('card') || p.mode.toLowerCase().includes('bank')
          const isKoko = p.mode.toLowerCase().includes('koko')
          const account = isCash ? cashAccount : isCard ? bankAccount : isKoko ? kokoAccount : null
          return {
            mode_of_payment: p.mode,
            amount: p.amount,
            ...(account ? { account } : {}),
          }
        })
        .filter((p) => p.amount > 0),
      ...(giftAmt > 0 ? [{
        mode_of_payment: giftModeName,
        amount: giftAmt,
        ...(giftAccount ? { account: giftAccount } : {}),
      }] : []),
      // Return credit: add as Cash so ERPNext sees the invoice as fully paid.
      // The return invoice already booked the offsetting negative entry, so these
      // cancel out correctly in the POS session closing reconciliation.
      ...(returnAmt > 0 ? [{
        mode_of_payment: 'Cash',
        amount: returnAmt,
        ...(cashAccount ? { account: cashAccount } : {}),
      }] : []),
    ]

    // If any item was given as a promotional free item, we already handled the scheme
    // client-side. Tell ERPNext not to re-apply its own pricing rules so the free item
    // isn't duplicated on the server.
    const hasPromoItems = items.some((i) => i.is_free_item)

    const doc = {
      doctype:               'POS Invoice',
      pos_profile:           posProfile,
      company:               posProfileData?.company  || '',
      currency:              posProfileData?.currency || 'LKR',
      customer:              currentBill.customer?.name || defaultCustomer,
      posting_date:          today,
      set_warehouse:         warehouse,
      items,
      payments:              paymentEntries,
      change_amount:         changeAmt || 0,
      ignore_pricing_rule:   hasPromoItems ? 1 : 0,
    }

    // Required by ERPNext v14+ — links the invoice to the session so SLEs are
    // created immediately on submission rather than deferred to the closing entry.
    doc.pos_opening_entry = posOpeningEntry

    if (discountAmt > 0) {
      doc.apply_discount_on = 'Grand Total'
      doc.discount_amount   = discountAmt
    }

    // Apply taxes — from Tax Rule (tax_category) or POS Profile fallback
    if (taxInfo?.taxes_and_charges) doc.taxes_and_charges = taxInfo.taxes_and_charges
    if (taxInfo?.taxes?.length > 0) {
      doc.taxes = taxInfo.taxes.map((t) => ({
        charge_type:            t.charge_type,
        account_head:           t.account_head,
        description:            t.description || t.account_head,
        rate:                   t.rate || 0,
        included_in_print_rate: t.included_in_print_rate || 0,
        cost_center:            t.cost_center || '',
      }))
    }

    return doc
  }

  // ── Build Sales Invoice payload for credit sales ─────────────────────────
  function buildCreditInvoice(taxInfo = null, itemTaxMap = {}) {
    const today     = new Date().toISOString().split('T')[0]
    const warehouse = posProfileData?.warehouse || ''

    const items = currentBill.items.map((item) => {
      const entry = {
        item_code: item.item_code,
        item_name: (item.item_name || '').replace(/\s*\[FREE\]$/i, ''),
        qty:       item.qty,
        rate:      item.unitPrice,
        uom:       item.uom || 'Nos',
        warehouse,
      }
      if (item.isFreePromo) {
        entry.is_free_item        = 1
        entry.rate                = 0
        entry.discount_percentage = 100
      }
      if (item.serial_no) entry.serial_no = item.serial_no
      if (item.batch_no)  entry.batch_no  = item.batch_no
      // Item-level tax template (India GST / per-item tax compliance)
      const itemTpl = itemTaxMap?.[item.item_code]
      if (itemTpl) entry.item_tax_template = itemTpl
      return entry
    })

    const hasPromoItems = items.some((i) => i.is_free_item)

    const doc = {
      doctype:             'Sales Invoice',
      company:             posProfileData?.company  || '',
      currency:            posProfileData?.currency || 'LKR',
      customer:            currentBill.customer.name,
      posting_date:        today,
      set_warehouse:       warehouse,
      is_pos:              0,   // regular Sales Invoice — creates receivable automatically
      ignore_pricing_rule: hasPromoItems ? 1 : 0,
      items,
    }

    if (discountAmt > 0) {
      doc.apply_discount_on = 'Grand Total'
      doc.discount_amount   = discountAmt
    }

    // Apply taxes — from Tax Rule (tax_category) or POS Profile fallback
    if (taxInfo?.taxes_and_charges) doc.taxes_and_charges = taxInfo.taxes_and_charges
    if (taxInfo?.taxes?.length > 0) {
      doc.taxes = taxInfo.taxes.map((t) => ({
        charge_type:            t.charge_type,
        account_head:           t.account_head,
        description:            t.description || t.account_head,
        rate:                   t.rate || 0,
        included_in_print_rate: t.included_in_print_rate || 0,
        cost_center:            t.cost_center || '',
      }))
    }

    return doc
  }

  // ── Build receipt HTML (80mm thermal-style) ──────────────────────────────
  function buildReceiptHtml(invoiceName, billHeader = '', billFooter = '', billHeaderImage = null, billFooterImage = null) {
    const now      = new Date()
    const dateStr  = now.toLocaleDateString('en-CA')   // YYYY-MM-DD
    const timeStr  = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    const _rawName  = userFullName || username || ''
    const _firstName = _rawName.includes('@') ? _rawName.split('@')[0].split('.')[0] : _rawName.split(' ')[0]
    const cashier   = _firstName.charAt(0).toUpperCase() + _firstName.slice(1)
    const customer = currentBill.customer?.customer_name || posProfileData?.customer || 'Walk-in Customer'
    const itemCount = currentBill.items.length

    // Sub total = raw item totals before bill discount
    const subTotal = currentBill.items.reduce((s, i) => s + i.total, 0)

    // Total savings = per-item price discounts + bill-level discount
    const totalItemDiscount = currentBill.items
      .filter((i) => !i.isFreePromo)
      .reduce((s, i) => {
        const lp = i.markedPrice ?? i.basePrice ?? i.unitPrice
        return s + Math.round((lp - i.unitPrice) * i.qty * 100) / 100
      }, 0)
    const totalSaved = Math.round((totalItemDiscount + discountAmt) * 100) / 100

    // Payment rows
    const allPayments = paymentType === 'credit'
      ? [{ mode: 'Credit (Receivable)', amount: grandTotal }]
      : [
          ...payments.filter((p) => p.amount > 0),
          ...(giftAmt > 0 ? [{ mode: giftModeName, amount: giftAmt }] : []),
          ...(returnAmt > 0 ? [{ mode: 'Return Credit', amount: returnAmt }] : []),
        ]
    const paymentReceived = allPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0)
    const paymentRowsHtml = allPayments.map((p) =>
      `<tr><td class="lbl">${p.mode} :</td><td class="val">${fmt(p.amount)}</td></tr>`
    ).join('')

    // Item rows — item name on its own line, detail row below
    const itemRows = currentBill.items.map((i) => {
      const mrp     = i.markedPrice ?? i.basePrice ?? i.unitPrice
      const isFree  = !!i.isFreePromo
      const uom     = i.uom || 'Pcs'
      return `
        <tr>
          <td colspan="4" style="padding:4px 0 1px 0;font-weight:bold;word-break:break-all">
            ${i.item_name}${isFree ? ' <span style="color:green;font-weight:normal">[FREE]</span>' : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 5px 0;white-space:nowrap">${i.qty}&nbsp;${uom}</td>
          <td style="text-align:right;padding:0 2px 5px;white-space:nowrap">${fmt(mrp)}</td>
          <td style="text-align:right;padding:0 2px 5px;white-space:nowrap">${isFree ? 'FREE' : fmt(i.unitPrice)}</td>
          <td style="text-align:right;padding:0 0 5px 0;white-space:nowrap;font-weight:bold">${isFree ? '0.00' : fmt(i.total)}</td>
        </tr>`
    }).join('')

    // Header / footer — stored as HTML from the rich text editor
    const toHtml = (s) => {
      if (!s) return ''
      // Legacy plain text (no tags) → convert newlines to <br>
      return s.includes('<') ? s : s.replace(/\n/g, '<br>')
    }
    const headerImgHtml = billHeaderImage
      ? `<div style="width:100%;margin-bottom:6px;text-align:center"><img src="${billHeaderImage}" style="width:100%;max-height:50mm;object-fit:contain;display:block"/></div>`
      : ''
    const headerTxtHtml = billHeader
      ? `<div style="width:100%;margin-bottom:8px;line-height:1.4;font-size:48px">${toHtml(billHeader)}</div>`
      : ''
    const footerTxtHtml = billFooter
      ? `<div style="width:100%;margin-top:10px;line-height:1.4">${toHtml(billFooter)}</div>`
      : ''
    const footerImgHtml = billFooterImage
      ? `<div style="width:100%;margin-top:6px;text-align:center"><img src="${billFooterImage}" style="width:100%;max-height:35mm;object-fit:contain;display:block"/></div>`
      : ''

    return `<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=800">
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        p{margin:0}
        div{max-width:100%}
        img{max-width:100%;height:auto}
        thead{display:table-row-group}
        body{font-family:Arial,Helvetica,sans-serif;font-size:38px;width:100%;padding:4mm 12mm 4mm 5mm}
        .sep{border-top:3px dashed #000;margin:10px 0}
        .sep-s{border-top:3px solid #000;margin:10px 0}
        table{width:100%;border-collapse:collapse}
        td,th{vertical-align:top}
        .lbl{text-align:right;padding:3px 10px 3px 0;color:#333;font-size:38px}
        .val{text-align:right;white-space:nowrap;font-weight:bold;font-size:38px}
        .grand td{font-size:44px;font-weight:bold}
        @page{margin:0;size:80mm auto}
      </style>
    </head><body>

      ${headerImgHtml}
      ${headerTxtHtml}
      <div class="sep"></div>

      <table style="font-size:34px;table-layout:fixed;width:100%">
        <colgroup><col style="width:55%"><col style="width:45%"></colgroup>
        <tr>
          <td style="word-break:break-all"><b>Invoice No</b><br>${invoiceName}</td>
          <td style="text-align:right;overflow:hidden;word-break:break-all"><b>No. of Items</b><br>${itemCount}</td>
        </tr>
        <tr style="height:5px"></tr>
        <tr>
          <td><b>Date</b><br>${dateStr}</td>
          <td style="text-align:right;overflow:hidden;word-break:break-all"><b>Time</b><br>${timeStr}</td>
        </tr>
        <tr style="height:5px"></tr>
        <tr>
          <td style="overflow:hidden"><b>Counter</b><br>${posProfile || ''}</td>
          <td style="text-align:right;overflow:hidden;word-break:break-all"><b>Cashier</b><br>${cashier}</td>
        </tr>
      </table>
      <div style="text-align:center;margin:8px 0;font-size:36px"><b>Customer</b><br>${customer}</div>

      <div class="sep"></div>
      <table>
        <tbody style="font-size:36px">
          <tr style="border-bottom:3px dashed #000;font-size:32px">
            <td style="text-align:left;padding-bottom:5px;width:28%;font-weight:bold">Qty</td>
            <td style="text-align:right;padding-bottom:5px;width:24%;font-weight:bold">MRP</td>
            <td style="text-align:right;padding-bottom:5px;width:24%;font-weight:bold">S.Price</td>
            <td style="text-align:right;padding-bottom:5px;width:24%;font-weight:bold">Total</td>
          </tr>
          ${itemRows}
        </tbody>
      </table>
      <div class="sep-s"></div>

      <table>
        <tr><td class="lbl">Total :</td><td class="val">${fmt(subTotal)}</td></tr>
        <tr><td class="lbl">Return :</td><td class="val">${fmt(returnAmt > 0 ? returnAmt : 0)}</td></tr>
        ${discountAmt > 0 ? `<tr><td class="lbl">Discount :</td><td class="val">${fmt(discountAmt)}</td></tr>` : ''}
        <tr class="grand"><td class="lbl">Grand Total :</td><td class="val" style="text-decoration:underline double">${fmt(grandTotal)}</td></tr>
        <tr style="height:4px"></tr>
        ${paymentRowsHtml}
        <tr><td class="lbl">Balance :</td><td class="val">${fmt(Math.max(0, totalChange))}</td></tr>
      </table>

      ${totalSaved > 0 ? `
      <div style="border:3px solid #000;margin:10px 0;padding:6px 10px;text-align:center;font-size:38px;font-weight:bold">
        Discount for this invoice : ${fmt(totalSaved)}
      </div>` : ''}

      <div class="sep"></div>
      ${footerTxtHtml}${footerImgHtml}

    </body></html>`
  }

  async function printReceipt(invoiceName) {
    try {
      const [billHeader, billFooter, billHeaderImage, billFooterImage, receiptPrinter] = await Promise.all([
        window.electronAPI.storeGet('billHeader').catch(() => ''),
        window.electronAPI.storeGet('billFooter').catch(() => ''),
        window.electronAPI.storeGet('billHeaderImage').catch(() => null),
        window.electronAPI.storeGet('billFooterImage').catch(() => null),
        window.electronAPI.storeGet('receiptPrinter').catch(() => ''),
      ])
      const html = buildReceiptHtml(
        invoiceName,
        billHeader || '',
        billFooter || '',
        billHeaderImage || null,
        billFooterImage || null,
      )
      if (window.electronAPI?.printReceipt) await window.electronAPI.printReceipt(html, receiptPrinter || undefined)
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
    addSoldToSession(currentBill.items)
    clearReturnCredit()
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
    if (!posOpeningEntry) {
      setError('No POS session is open — please open a POS session before processing sales.')
      return
    }
    if (paymentType === 'credit' && !creditCustomerValid) {
      setError('Credit sale requires a named customer — Walk-in Customer is not allowed')
      return
    }
    if (paymentType === 'cash' && !isFullyPaid) {
      setError(`Balance due: ${fmt(balanceDue)} — add more payment`)
      return
    }
    if (paymentType === 'cash' && giftRows.length > 0 && giftAmt > 0 && !giftAccount) {
      setError(`Gift card account is not configured — set the "Gift Card" field on the POS Profile in ERPNext, or configure a GL account in Settings.`)
      return
    }
    setSubmitting(true)
    setError('')

    // Resolve applicable taxes — use pre-fetched data if ready, else fetch now
    const company     = posProfileData?.company || ''
    const taxCategory = currentBill.customer?.tax_category || posProfileData?.tax_category || ''
    let taxInfo    = null
    let itemTaxMap = {}
    if (prefetchedTax.current.ready) {
      taxInfo    = prefetchedTax.current.taxInfo
      itemTaxMap = prefetchedTax.current.itemTaxMap
    } else {
      try {
        const uniqueCodes = [...new Set(currentBill.items.map((i) => i.item_code))]
        const [resolvedTax, resolvedItemTax] = await Promise.all([
          taxCategory ? getApplicableTaxes(company, taxCategory) : Promise.resolve(null),
          getItemTaxTemplates(uniqueCodes),
        ])
        taxInfo    = resolvedTax
        itemTaxMap = resolvedItemTax || {}
      } catch { /* ignore — fallback below */ }
    }
    if (!taxInfo) {
      const profileTaxes = posProfileData?.taxes || []
      if (profileTaxes.length > 0 || posProfileData?.taxes_and_charges) {
        taxInfo = { taxes_and_charges: posProfileData?.taxes_and_charges || '', taxes: profileTaxes }
      }
    }

    try {

      if (paymentType === 'credit') {
        // ── Credit sale → Sales Invoice (creates customer receivable, no payment needed)
        if (!isOnline) throw new Error('Credit sales require an internet connection')
        const invoiceData = buildCreditInvoice(taxInfo, itemTaxMap)
        const draft = await createSalesInvoice(invoiceData)
        if (!draft?.name) throw new Error('Sales Invoice created but no name returned')
        // Pass full draft doc — avoids an extra GET round-trip before submit
        await submitSalesInvoice(draft)
        printReceipt(draft.name)
        finishCheckout(0)
      } else {
        // ── Cash / Card sale → POS Invoice
        const invoiceData = buildInvoice(totalChange, taxInfo, itemTaxMap)
        if (!isOnline) throw new Error('offline')
        const draft = await createPOSInvoice(invoiceData)
        if (!draft?.name) throw new Error('Invoice created but no name returned')
        // Pass full draft doc — avoids an extra GET round-trip before submit
        await submitPOSInvoice(draft)
        // Track exchange overpayment so SalesSummary can show it as Refund Paid
        if (returnAmt > 0 && returnOverpay > 0) {
          try {
            const overpayMap = (await cacheGetPersist('exchangeOverpayMap')) || {}
            overpayMap[draft.name] = returnOverpay
            await cacheSetPersist('exchangeOverpayMap', overpayMap)
          } catch { /* non-critical */ }
        }
        // Mark redeemed gift voucher serials as Inactive so they can't be reused
        const usedSerials = giftRows.filter((r) => r.status === 'valid' && r.serial).map((r) => r.serial)
        if (usedSerials.length > 0) await Promise.allSettled(usedSerials.map((s) => markSerialNoUsed(s)))
        printReceipt(draft.name)
        kickCashDrawer()
        finishCheckout(totalChange)
      }
    } catch (err) {
      if (paymentType === 'cash' && (!isOnline || err.message === 'offline')) {
        const invoiceData = buildInvoice(totalChange, taxInfo, itemTaxMap)
        await queueInvoice(invoiceData)
        kickCashDrawer()
        finishCheckout(totalChange)
      } else {
        // err.message is the clean human-readable message parsed from _server_messages
        // by the request() helper. Only fall back to the raw traceback (exc) if nothing
        // better is available, and strip it so the UI shows just the last line.
        let msg = err?.message || ''
        if (!msg || msg.startsWith('HTTP ')) {
          const exc = err?.response?.data?.exc || ''
          // Extract the last non-empty line from the Python traceback as the error
          const lines = exc.split('\n').map((l) => l.trim()).filter(Boolean)
          msg = lines[lines.length - 1] || err?.response?.data?.message || 'Submission failed'
        }
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
          <div className={`bg-gray-800 rounded-3xl px-16 py-12 text-center shadow-2xl border-2 ${returnOverpay > 0 && change === 0 ? 'border-orange-600' : 'border-yellow-600'}`}>
            <p className={`text-sm font-semibold uppercase tracking-widest mb-3 ${returnOverpay > 0 && change === 0 ? 'text-orange-400' : 'text-yellow-400'}`}>
              {returnOverpay > 0 && change === 0 ? 'Pay to Customer' : 'Change to Return'}
            </p>
            <p className={`font-bold tabular-nums ${returnOverpay > 0 && change === 0 ? 'text-orange-300' : 'text-yellow-300'}`} style={{ fontSize: '5rem', lineHeight: 1 }}>
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
        className={`bg-gray-800 rounded-2xl shadow-2xl w-full border border-gray-600 outline-none ${
          paymentType === 'cash' && giftRows.length > 0 ? 'max-w-3xl' : 'max-w-md'
        }`}
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
              {returnAmt > 0 && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-amber-400 text-xs">Return credit ({returnInvoiceName})</span>
                  <span className="text-amber-400 text-xs tabular-nums">− {fmt(returnAmt)}</span>
                </div>
              )}
              {returnAmt > 0 && (
                <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-700">
                  <span className="text-white text-sm font-semibold">Net Due</span>
                  <span className="text-white font-bold text-xl tabular-nums">{fmt(netTotal)}</span>
                </div>
              )}
              {returnOverpay > 0 && (
                <div className="mt-2 px-3 py-2.5 bg-orange-900/30 border border-orange-700 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-orange-300 text-xs font-bold uppercase tracking-wider">Pay to Customer</p>
                      <p className="text-orange-400/70 text-xs mt-0.5">Return credit exceeds bill — give cash back</p>
                    </div>
                    <span className="text-orange-300 font-bold text-2xl tabular-nums">{fmt(returnOverpay)}</span>
                  </div>
                  <p className="text-orange-400/60 text-xs mt-1.5 border-t border-orange-800/50 pt-1.5">
                    Click <strong className="text-orange-300">Confirm</strong> → cash drawer opens → hand {fmt(returnOverpay)} cash to customer
                  </p>
                </div>
              )}
            </div>

            {/* ── Landscape: payments (left) + gift card (right) when gift active ── */}
            <div className={paymentType === 'cash' && giftRows.length > 0 ? 'flex' : ''}>

              {/* LEFT: payment toggle + rows + summary + confirm */}
              <div className={`flex flex-col${paymentType === 'cash' && giftRows.length > 0 ? ' flex-1 min-w-0' : ''}`}>

                {/* ── Payment type toggle ───────────── */}
                <div className="px-6 pt-4 pb-0 flex gap-2">
              <button
                type="button"
                onClick={() => setPaymentType('cash')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold border-2 transition-colors ${
                  paymentType === 'cash'
                    ? 'bg-green-700 border-green-500 text-white'
                    : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:text-white hover:border-gray-500'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Cash / Card
              </button>
              <button
                type="button"
                onClick={() => setPaymentType('credit')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold border-2 transition-colors ${
                  paymentType === 'credit'
                    ? 'bg-amber-700 border-amber-500 text-white'
                    : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:text-white hover:border-gray-500'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Credit (Receivable)
                <span className="opacity-40 font-mono font-normal text-xs">F8</span>
              </button>
            </div>

            {/* ── Payment method rows ─────────────────────────── */}
            <div className="px-6 py-4 space-y-3">
              {/* ── Credit mode panel ── */}
              {paymentType === 'credit' && (
                <div className={`rounded-xl border-2 px-5 py-5 text-center ${
                  creditCustomerValid
                    ? 'border-amber-600 bg-amber-900/20'
                    : 'border-red-800 bg-red-900/10'
                }`}>
                  {creditCustomerValid ? (
                    <>
                      <div className="w-10 h-10 rounded-full bg-amber-700/50 flex items-center justify-center mx-auto mb-3">
                        <svg className="w-5 h-5 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <p className="text-white font-bold text-2xl tabular-nums mb-1">{fmt(grandTotal)}</p>
                      <p className="text-amber-400 text-sm">will be added to receivables for</p>
                      <p className="text-white font-semibold text-base mt-1">{currentBill.customer.customer_name}</p>
                      <p className="text-gray-500 text-xs mt-2">Invoice will be submitted as unpaid — customer owes this amount</p>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full bg-red-800/50 flex items-center justify-center mx-auto mb-3">
                        <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <p className="text-red-400 font-semibold text-sm">
                        {currentBill.customer ? 'Walk-in Customer cannot be used for credit' : 'No customer selected'}
                      </p>
                      <p className="text-gray-500 text-xs mt-1">
                        Select a named customer (Retail or Wholesale) — not Walk-in
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* ── Cash/Card payment rows (hidden in credit mode) ── */}
              {paymentType === 'cash' && payments.map((p, idx) => {
                const isCash   = p.mode.toLowerCase().includes('cash')
                const isCard   = p.mode.toLowerCase().includes('card')
                const isKoko   = p.mode.toLowerCase().includes('koko')
                const isGift   = !isCash && !isCard && !isKoko && (
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
                        isCash ? 'bg-green-800/60' : isCard ? 'bg-blue-800/60' : isKoko ? 'bg-orange-800/60' : isGift ? 'bg-purple-800/60' : 'bg-gray-600/60'
                      }`}>
                        {isCash ? (
                          <svg className="w-4 h-4 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        ) : isCard ? (
                          <svg className="w-4 h-4 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                          </svg>
                        ) : isKoko ? (
                          <svg className="w-4 h-4 text-orange-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2v-2a2 2 0 00-2-2H8a2 2 0 00-2 2v2a2 2 0 002 2zM12 3v1m0 0a4 4 0 014 4c0 1.5-.5 2.5-1.5 3.5S13 13 13 14h-2c0-1 .5-1.5 1.5-2.5S14 9.5 14 8a2 2 0 10-4 0c0 1.5.5 2.5 1.5 3.5" />
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
                          {isCash ? 'Key: C' : isCard ? 'Key: D' : isKoko ? 'Key: K' : ''}
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

              {/* ── Apply Gift Card button — panel moves to right column when active ── */}
              {paymentType === 'cash' && giftRows.length === 0 && (
                <button
                  type="button"
                  onClick={enableGiftCard}
                  className="w-full flex items-center justify-center gap-2 border border-dashed border-purple-700 hover:border-purple-500 text-purple-500 hover:text-purple-300 rounded-xl py-2.5 text-sm transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                  </svg>
                  Apply {giftModeName}
                  <span className="text-purple-700 text-xs ml-1">Key: G</span>
                </button>
              )}
            </div>

            {/* ── Summary (cash mode only) ─────────────────────── */}
            {paymentType === 'cash' && (
              <div className="px-6 pb-2 space-y-2">
                {returnAmt > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-amber-400">Return Credit</span>
                    <span className="text-amber-400 font-semibold tabular-nums">{fmt(returnAmt)}</span>
                  </div>
                )}
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

                {isFullyPaid && totalChange === 0 && (
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
            )}

            {error && (
              <div className="mx-6 mb-2 bg-red-900/40 border border-red-700 rounded-lg px-4 py-2.5 text-red-300 text-sm break-words">
                {error}
              </div>
            )}

            {/* ── No session warning ───────────────────────────── */}
            {!posOpeningEntry && (
              <div className="mx-6 mb-2 bg-amber-900/40 border border-amber-700 rounded-lg px-4 py-3 flex items-center gap-3">
                <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div>
                  <p className="text-amber-300 text-sm font-semibold">No POS Session Open</p>
                  <p className="text-amber-500 text-xs mt-0.5">Sales cannot be processed until a cashier opens a session.</p>
                </div>
              </div>
            )}

            {/* ── Confirm button ────────────────────────────────── */}
            <div className="px-6 pb-5 pt-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting || !isFullyPaid || !posOpeningEntry}
                className={`w-full disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-colors text-lg ${
                  !posOpeningEntry
                    ? 'bg-gray-700 cursor-not-allowed'
                    : paymentType === 'credit'
                      ? 'bg-amber-600 hover:bg-amber-500 active:bg-amber-700'
                      : 'bg-green-600 hover:bg-green-500 active:bg-green-700'
                }`}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Submitting…
                  </span>
                ) : !posOpeningEntry ? (
                  'No Session — Cannot Confirm'
                ) : paymentType === 'credit' ? (
                  `Confirm Credit  ·  ${fmt(grandTotal)}`
                ) : returnOverpay > 0 && netTotal === 0 ? (
                  `Confirm — Pay ${fmt(returnOverpay)} to Customer`
                ) : (
                  `Confirm  ·  ${fmt(grandTotal)}`
                )}
              </button>
              <p className="text-center text-xs text-gray-600 mt-2">Enter to confirm · ESC to cancel · Tab to switch</p>
            </div>
          </div>{/* end left column */}

          {/* RIGHT column: gift card panel — landscape, only when gift rows active */}
          {paymentType === 'cash' && giftRows.length > 0 && (
            <div className="w-80 flex-shrink-0 border-l border-gray-700 flex flex-col overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-purple-800/30 bg-purple-900/10">
                <div className="w-8 h-8 rounded-lg bg-purple-800/60 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-white text-sm font-semibold">{giftModeName}</span>
                  <div className="text-xs mt-0.5 truncate">
                    {giftAccResolving ? <span className="text-gray-500">Resolving account...</span>
                      : giftAccount ? <span className="text-green-500">{giftAccount}</span>
                      : <span className="text-amber-400">No account - set Gift Card field in POS Profile</span>}
                  </div>
                </div>
                <button type="button" onClick={disableGiftCard} className="text-gray-600 hover:text-red-400 text-xl leading-none flex-shrink-0">x</button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-purple-900/40">
                {giftRows.map((row, rowIdx) => {
                  const isActiveSuggest = giftSuggestRowId === row.id
                  return (
                    <div key={row.id} className="px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-purple-400 text-xs font-semibold uppercase tracking-wide">Voucher {rowIdx + 1}</span>
                        {giftRows.length > 1 && (
                          <button type="button" onClick={() => removeGiftRow(row.id)} className="text-gray-600 hover:text-red-400 text-sm leading-none">Remove</button>
                        )}
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {[1000, 2500, 5000, 7500, 10000].map((d) => (
                          <button key={d} type="button"
                            onClick={() => { setGiftRows((prev) => prev.map((r) => r.id === row.id ? { ...r, amount: String(d) } : r)); giftRowSerialRefs.current[row.id]?.focus() }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${parseFloat(row.amount) === d ? 'bg-purple-700 border-purple-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-purple-500 hover:text-purple-200'}`}>
                            {d >= 1000 ? `${d / 1000}K` : d}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 relative">
                          <input
                            ref={(el) => { giftRowSerialRefs.current[row.id] = el }}
                            type="text" placeholder="Voucher serial..." value={row.serial}
                            onChange={(e) => { const v = e.target.value; setGiftRows((prev) => prev.map((r) => r.id === row.id ? { ...r, serial: v, status: null, serialData: null } : r)); setGiftSuggestRowId(row.id); setGiftActiveSerial(v) }}
                            onBlur={() => { setTimeout(() => { if (giftSuggestRowId === row.id) setSerialSuggestions([]) }, 200); if (row.serial.trim() && !serialSuggestions.length) validateSerial(row.id, row.serial) }}
                            onKeyDown={(e) => {
                              if (isActiveSuggest && serialSuggestions.length > 0) {
                                if (e.key === 'ArrowDown') { e.preventDefault(); setSerialDropIdx((i) => Math.min(i + 1, serialSuggestions.length - 1)); return }
                                if (e.key === 'ArrowUp')   { e.preventDefault(); setSerialDropIdx((i) => Math.max(i - 1, 0)); return }
                                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); const s = serialSuggestions[serialDropIdx]; if (s) { setGiftRows((prev) => prev.map((r) => r.id === row.id ? { ...r, serial: s.name } : r)); setSerialSuggestions([]); validateSerial(row.id, s.name) } return }
                                if (e.key === 'Escape') { e.preventDefault(); setSerialSuggestions([]); return }
                              }
                              if (e.key === 'Enter') { e.preventDefault(); validateSerial(row.id, row.serial) }
                            }}
                            className="w-full rounded-lg px-3 py-2 text-sm text-white bg-gray-700 border-2 border-gray-600 focus:outline-none focus:border-purple-500 placeholder-gray-600"
                          />
                          {isActiveSuggest && serialSuggestions.length > 0 && (
                            <div className="absolute z-20 left-0 right-0 top-full mt-0.5 bg-gray-900 border border-purple-700/60 rounded-lg shadow-xl overflow-hidden">
                              {serialSuggestions.map((s, i) => (
                                <button key={s.name} type="button"
                                  onMouseDown={(e) => { e.preventDefault(); setGiftRows((prev) => prev.map((r) => r.id === row.id ? { ...r, serial: s.name } : r)); setSerialSuggestions([]); validateSerial(row.id, s.name) }}
                                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${i === serialDropIdx ? 'bg-purple-800/60 text-purple-200' : 'text-gray-300 hover:bg-gray-700'}`}>
                                  <span className="font-mono font-semibold">{s.name}</span>
                                  {s.item_name && <span className="ml-2 text-gray-500">{s.item_name}</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
                          {row.status === 'checking' && <svg className="w-5 h-5 animate-spin text-purple-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>}
                          {row.status === 'valid'    && <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg></div>}
                          {row.status === 'invalid'  && <div className="w-6 h-6 rounded-full bg-red-700 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg></div>}
                          {row.status === 'expired'  && <div className="w-6 h-6 rounded-full bg-amber-600 flex items-center justify-center"><span className="text-white text-xs font-bold">!</span></div>}
                        </div>
                      </div>
                      {row.status === 'valid'   && row.serialData && <p className="text-green-400 text-xs pl-1">Valid - {row.serialData.item_code}{row.serialData.warranty_expiry_date ? ` - Expires ${row.serialData.warranty_expiry_date}` : ''}</p>}
                      {row.status === 'invalid' && <p className="text-red-400 text-xs pl-1">Not found or voucher not yet issued</p>}
                      {row.status === 'expired' && <p className="text-amber-400 text-xs pl-1">Expired{row.serialData?.warranty_expiry_date ? ` on ${row.serialData.warranty_expiry_date}` : ''}</p>}
                      <div className="flex items-center gap-3">
                        <span className="text-gray-400 text-sm flex-1">Amount</span>
                        <input type="number" min="0" step="0.01" value={row.amount} placeholder="0.00"
                          onChange={(e) => setGiftRows((prev) => prev.map((r) => r.id === row.id ? { ...r, amount: e.target.value } : r))}
                          onKeyDown={(e) => { if (e.key === 'Enter') return }}
                          className="w-32 rounded-lg px-3 py-2 text-right font-bold text-base focus:outline-none tabular-nums bg-gray-700 border-2 border-purple-500 text-purple-200" />
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="px-4 py-2 border-t border-purple-900/40 flex-shrink-0">
                <button type="button" onClick={addGiftRow}
                  className="w-full flex items-center justify-center gap-2 text-purple-400 hover:text-purple-200 text-xs py-1.5 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add another voucher
                </button>
              </div>
            </div>
          )}
        </div>{/* end landscape wrapper */}
        </>
      </div>
    </div>
  )
}
