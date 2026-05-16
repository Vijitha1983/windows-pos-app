// All HTTP goes through window.electronAPI.apiRequest (Electron main process).
// This completely sidesteps CORS, SameSite cookie restrictions, and CSRF token
// issues that plague renderer-side axios against a remote ERPNext instance.

let baseURL = ''

export function setBaseURL(url) {
  baseURL = url.replace(/\/$/, '')
}

export function getBaseURL() {
  return baseURL
}

async function request(method, path, body = null, extraHeaders = {}) {
  const url = baseURL + path
  const result = await window.electronAPI.apiRequest(method, url, body, extraHeaders)

  if (!result.ok) {
    // 403 can mean "not logged in" OR "no permission" — only treat as auth expiry
    // when it is NOT a PermissionError (which means the user IS logged in).
    const exc = result.data?.exc_type
    const isAuthFailure =
      result.status === 401 ||
      (result.status === 403 && exc !== 'PermissionError')
    if (isAuthFailure) {
      window.dispatchEvent(new CustomEvent('auth:expired'))
    }
    // ERPNext puts the human-readable detail in _server_messages (JSON-encoded array).
    // result.data.message is often just the exception class name (e.g. "ValidationError")
    // so check _server_messages first, then fall back to message/exc_type.
    let msg = ''
    if (result.data?._server_messages) {
      try {
        const parsed = JSON.parse(result.data._server_messages)
        msg = parsed
          .map((m) => { try { return JSON.parse(m).message } catch { return m } })
          .filter(Boolean)
          .join(' ')
          .replace(/<[^>]*>/g, '')   // strip HTML links ERPNext includes
          .replace(/\s+/g, ' ').trim()
      } catch {}
    }
    if (!msg) {
      if (result.status === 0) {
        msg = 'Cannot connect to server. Check the URL (include https://) and your network connection.'
      } else {
        msg = result.data?.message || result.data?.exc_type || `Server error (HTTP ${result.status})`
      }
    }
    const err = new Error(msg)
    err.status = result.status
    err.response = { data: result.data, status: result.status }
    throw err
  }

  return result.data
}

function qs(params) {
  return (
    '?' +
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
  )
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function login(url, username, password) {
  setBaseURL(url)
  const data = await request('POST', '/api/method/login', { usr: username, pwd: password })
  return data
}

export async function logout() {
  await request('GET', '/api/method/logout')
  await window.electronAPI.apiClearSession()
}

export async function getLoggedInUser() {
  const data = await request('GET', '/api/method/frappe.auth.get_logged_user')
  return data.message
}

export async function getUserFullName(username) {
  const data = await request('GET', `/api/resource/User/${encodeURIComponent(username)}` + qs({ fields: JSON.stringify(['full_name', 'first_name', 'last_name']) }))
  const u = data.data
  if (u?.full_name) return u.full_name
  return [u?.first_name, u?.last_name].filter(Boolean).join(' ') || username
}

// ─── Mode of Payment / Account helpers ───────────────────────────────────────

// Resolves the GL account for a gift-card/voucher payment in two steps:
//   1. Check the Mode of Payment document's per-company account table.
//   2. Fall back to searching Account by account_name (ignores the number prefix
//      that ERPNext prepends, so "200417 - Gift Card - IT" is found via "Gift Card").
export async function resolveGiftCardAccount(modeName, company, accountShortName) {
  // Step 1 — Mode of Payment → Accounts table
  try {
    const mop = await request('GET', `/api/resource/Mode of Payment/${encodeURIComponent(modeName)}`)
    const entry = (mop.data?.accounts || []).find((a) => a.company === company)
    if (entry?.default_account) return entry.default_account
  } catch { /* fall through */ }

  // Step 2 — search Account by account_name field (number-prefix safe)
  if (accountShortName) {
    try {
      const data = await request('GET', '/api/resource/Account' + qs({
        filters: JSON.stringify([
          ['account_name', '=', accountShortName],
          ['company',      '=', company],
          ['is_group',     '=', 0],
        ]),
        fields: JSON.stringify(['name']),
        limit_page_length: 1,
      }))
      if (data.data?.[0]?.name) return data.data[0].name
    } catch { /* fall through */ }
  }

  return null
}

// ─── Category Wise Sales ─────────────────────────────────────────────────────

// Returns { [item_group]: total_amount } for given POS + credit Sales invoice names.
// Uses bulk child-table queries (2 calls total) instead of fetching each invoice individually.
export async function getCategoryWiseSales(invoiceNames, creditInvoiceNames = []) {
  if ((!invoiceNames || invoiceNames.length === 0) && creditInvoiceNames.length === 0) return {}

  // Fetch all invoice line items in two parallel calls via child table resources
  const [posItemsRes, siItemsRes] = await Promise.all([
    invoiceNames.length > 0
      ? request('GET', '/api/resource/POS Invoice Item' + qs({
          filters:           JSON.stringify([['parent', 'in', invoiceNames]]),
          fields:            JSON.stringify(['item_code', 'item_group', 'amount']),
          limit_page_length: 2000,
        })).catch(() => ({ data: [] }))
      : Promise.resolve({ data: [] }),
    creditInvoiceNames.length > 0
      ? request('GET', '/api/resource/Sales Invoice Item' + qs({
          filters:           JSON.stringify([['parent', 'in', creditInvoiceNames]]),
          fields:            JSON.stringify(['item_code', 'item_group', 'amount']),
          limit_page_length: 2000,
        })).catch(() => ({ data: [] }))
      : Promise.resolve({ data: [] }),
  ])

  const allRows = [
    ...(posItemsRes.data || []),
    ...(siItemsRes.data || []),
  ]
    .filter((r) => r.item_code && r.amount > 0)
    .map((r) => ({ item_code: r.item_code, item_group: r.item_group || null, amount: r.amount }))

  if (allRows.length === 0) return {}

  // For any rows where item_group wasn't stored on the invoice, look it up from Item doctype
  const missing = [...new Set(allRows.filter((r) => !r.item_group).map((r) => r.item_code))]
  if (missing.length > 0) {
    try {
      const data = await request('GET', '/api/resource/Item' + qs({
        filters:           JSON.stringify([['name', 'in', missing]]),
        fields:            JSON.stringify(['name', 'item_group']),
        limit_page_length: missing.length + 10,
      }))
      const map = {}
      for (const item of data.data || []) {
        if (item.name && item.item_group) map[item.name] = item.item_group
      }
      for (const row of allRows) {
        if (!row.item_group && map[row.item_code]) row.item_group = map[row.item_code]
      }
    } catch {}
  }

  // Aggregate by item_group
  const result = {}
  for (const row of allRows) {
    if (row.item_group) {
      result[row.item_group] = (result[row.item_group] || 0) + row.amount
    }
  }
  return result
}

// ─── Stock Balance ───────────────────────────────────────────────────────────

// Fetches all Bin records for a warehouse and returns a map of item_code → actual_qty.
// Used by ItemGrid to display stock on each item card.
export async function getWarehouseStock(warehouse) {
  if (!warehouse) return {}
  const data = await request('GET', '/api/resource/Bin' + qs({
    filters:          JSON.stringify([['warehouse', '=', warehouse]]),
    fields:           JSON.stringify(['item_code', 'actual_qty']),
    limit_page_length: 2000,
  }))
  const map = {}
  for (const b of data.data || []) { map[b.item_code] = b.actual_qty ?? 0 }
  return map
}

// ─── Email ───────────────────────────────────────────────────────────────────

// Sends an email immediately via Frappe's whitelisted communication.make method.
// Requires an outgoing email account configured in ERPNext.
export async function sendSummaryEmail(toEmail, subject, htmlContent) {
  const data = await request('POST', '/api/method/frappe.core.doctype.communication.communication.make', {
    recipients:           toEmail,
    subject,
    content:              htmlContent,
    send_email:           1,
    communication_medium: 'Email',
    sent_or_received:     'Sent',
  })
  return data
}

// ─── GL Accounts ─────────────────────────────────────────────────────────────

// Fetches leaf GL accounts filtered by account_type ('Cash', 'Bank', etc.)
// and optionally by company. Used to populate account pickers in Settings.
export async function getGLAccounts(accountType, company) {
  const filters = [['is_group', '=', 0]]
  if (accountType) filters.push(['account_type', '=', accountType])
  if (company)     filters.push(['company',      '=', company])
  const data = await request('GET', '/api/resource/Account' + qs({
    filters:          JSON.stringify(filters),
    fields:           JSON.stringify(['name', 'account_name']),
    limit_page_length: 100,
    order_by:         'name asc',
  }))
  return data.data || []
}

// ─── Gift Voucher Serial Validation ─────────────────────────────────────────

// Returns the Serial No document from ERPNext.
// Caller checks: status === 'Delivered' (was sold) and warranty_expiry_date not past.
export async function validateGiftVoucherSerial(serialNo) {
  const data = await request('GET', `/api/resource/Serial No/${encodeURIComponent(serialNo)}`)
  return data.data
}

// Searches redeemable (Delivered) gift voucher serials matching the query prefix.
// Status 'Delivered' means the voucher was sold to a customer and can now be redeemed as payment.
export async function searchDeliveredSerialNos(query) {
  if (!query) return []
  const data = await request('GET', '/api/resource/Serial No' + qs({
    filters:           JSON.stringify([
      ['status', '=', 'Delivered'],
      ['name',   'like', `${query}%`],
    ]),
    fields:            JSON.stringify(['name', 'item_code', 'item_name']),
    limit_page_length: 10,
    order_by:          'name asc',
  }))
  return data.data || []
}

// Returns available (Active) serial numbers for an item, optionally scoped to a warehouse.
export async function getAvailableSerialNos(itemCode, warehouse) {
  const filters = [
    ['item_code', '=', itemCode],
    ['status',    '=', 'Active'],
  ]
  if (warehouse) filters.push(['warehouse', '=', warehouse])
  const data = await request('GET', '/api/resource/Serial No' + qs({
    filters:           JSON.stringify(filters),
    fields:            JSON.stringify(['name', 'warehouse']),
    limit_page_length: 200,
    order_by:          'name asc',
  }))
  return (data.data || []).map((s) => s.name)
}

// ─── POS Profiles ────────────────────────────────────────────────────────────

export async function getPOSProfiles() {
  const params = {
    fields: JSON.stringify(['name', 'warehouse', 'company', 'currency']),
    limit_page_length: 50,
  }
  const data = await request('GET', '/api/resource/POS Profile' + qs(params))
  return data.data
}

export async function getPOSProfile(name) {
  const data = await request('GET', `/api/resource/POS Profile/${encodeURIComponent(name)}`)
  return data.data
}

// ─── Item Groups ─────────────────────────────────────────────────────────────

export async function getItemGroups() {
  const params = {
    fields: JSON.stringify(['name', 'parent_item_group', 'is_group']),
    filters: JSON.stringify([['is_group', '=', 0]]),
    limit_page_length: 100,
    order_by: 'name asc',
  }
  const data = await request('GET', '/api/resource/Item Group' + qs(params))
  return data.data
}

// ─── Items ───────────────────────────────────────────────────────────────────

const ITEM_FIELDS = JSON.stringify([
  'name', 'item_code', 'item_name', 'item_group', 'standard_rate', 'image', 'stock_uom',
])

export async function getItems(filters = {}, limit = 100, start = 0) {
  const apiFilters = [['disabled', '=', 0], ['is_sales_item', '=', 1]]
  if (filters.itemGroup) apiFilters.push(['item_group', '=', filters.itemGroup])

  const params = {
    fields: ITEM_FIELDS,
    filters: JSON.stringify(apiFilters),
    limit_page_length: limit,
    limit_start: start,
    order_by: 'item_name asc',
  }
  const data = await request('GET', '/api/resource/Item' + qs(params))
  return data.data
}

export async function searchItems(query) {
  const base = [['disabled', '=', 0], ['is_sales_item', '=', 1]]

  const [byName, byCode] = await Promise.all([
    request('GET', '/api/resource/Item' + qs({
      fields: ITEM_FIELDS,
      filters: JSON.stringify([...base, ['item_name', 'like', `%${query}%`]]),
      limit_page_length: 20,
    })),
    request('GET', '/api/resource/Item' + qs({
      fields: ITEM_FIELDS,
      filters: JSON.stringify([...base, ['item_code', 'like', `%${query}%`]]),
      limit_page_length: 20,
    })),
  ])

  const seen = new Set()
  return [...byName.data, ...byCode.data].filter((item) => {
    if (seen.has(item.item_code)) return false
    seen.add(item.item_code)
    return true
  })
}

export async function getItem(itemCode) {
  const data = await request('GET', `/api/resource/Item/${encodeURIComponent(itemCode)}`)
  return data.data
}

// Returns the selling rate for an item from a specific price list, or null if not found.
export async function getItemPriceListRate(itemCode, priceList) {
  if (!itemCode || !priceList) return null
  try {
    const data = await request('GET', '/api/resource/Item Price' + qs({
      filters: JSON.stringify([
        ['item_code',  '=', itemCode],
        ['price_list', '=', priceList],
        ['selling',    '=', 1],
      ]),
      fields:            JSON.stringify(['price_list_rate']),
      limit_page_length: 1,
    }))
    return data.data?.[0]?.price_list_rate ?? null
  } catch {
    return null
  }
}

// ─── Customers ───────────────────────────────────────────────────────────────

export async function getCustomers(search = '') {
  const filters = [['disabled', '=', 0]]
  if (search) filters.push(['customer_name', 'like', `%${search}%`])

  const params = {
    fields: JSON.stringify(['name', 'customer_name', 'mobile_no']),
    filters: JSON.stringify(filters),
    limit_page_length: 20,
    order_by: 'customer_name asc',
  }
  const data = await request('GET', '/api/resource/Customer' + qs(params))
  return data.data
}

export async function getCustomerOutstandingInvoices(customerName) {
  const params = {
    fields: JSON.stringify(['name', 'posting_date', 'due_date', 'outstanding_amount', 'grand_total']),
    filters: JSON.stringify([
      ['customer', '=', customerName],
      ['outstanding_amount', '>', 0],
      ['docstatus', '=', 1],
    ]),
    limit_page_length: 100,
    order_by: 'due_date asc',
  }
  const data = await request('GET', '/api/resource/Sales Invoice' + qs(params))
  return data.data
}

// ─── Sales Invoice (credit sales — no payment required, creates receivable) ──

export async function createSalesInvoice(invoiceData) {
  const data = await request('POST', '/api/resource/Sales Invoice', invoiceData)
  return data.data
}

export async function submitSalesInvoice(docOrName) {
  const doc = typeof docOrName === 'string'
    ? (await request('GET', `/api/resource/Sales Invoice/${encodeURIComponent(docOrName)}`)).data
    : docOrName
  const data = await request('POST', '/api/method/frappe.client.submit', { doc })
  return data.message || data
}

// ─── POS Invoice ─────────────────────────────────────────────────────────────

// Step 1: create a draft (docstatus=0), returns the saved doc with its name
export async function createPOSInvoice(invoiceData) {
  const data = await request('POST', '/api/resource/POS Invoice', invoiceData)
  return data.data
}

// Step 2: submit the draft.
// Accepts either the full doc object returned by createPOSInvoice (fast path — no extra
// GET needed because the create response already contains modified timestamp) or a name
// string (slow fallback that re-fetches).
export async function submitPOSInvoice(docOrName) {
  const doc = typeof docOrName === 'string'
    ? (await request('GET', `/api/resource/POS Invoice/${encodeURIComponent(docOrName)}`)).data
    : docOrName
  const data = await request('POST', '/api/method/frappe.client.submit', { doc })
  return data.message || data
}

export async function getPOSInvoices(filters = {}) {
  const apiFilters = [['docstatus', '=', 1]]
  if (filters.posProfile) apiFilters.push(['pos_profile', '=', filters.posProfile])

  const params = {
    fields: JSON.stringify(['name', 'customer', 'grand_total', 'posting_date', 'status']),
    filters: JSON.stringify(apiFilters),
    limit_page_length: 50,
  }
  const data = await request('GET', '/api/resource/POS Invoice' + qs(params))
  return data.data
}

// Search submitted POS Invoices (not returns) by invoice name, customer name, or date
export async function searchPOSInvoices(query, posProfile) {
  const base = [['docstatus', '=', 1], ['is_return', '=', 0]]
  if (posProfile) base.push(['pos_profile', '=', posProfile])

  const byName = request('GET', '/api/resource/POS Invoice' + qs({
    fields: JSON.stringify(['name', 'customer', 'customer_name', 'grand_total', 'posting_date']),
    filters: JSON.stringify([...base, ['name', 'like', `%${query}%`]]),
    limit_page_length: 15,
    order_by: 'posting_date desc',
  }))
  const byCust = request('GET', '/api/resource/POS Invoice' + qs({
    fields: JSON.stringify(['name', 'customer', 'customer_name', 'grand_total', 'posting_date']),
    filters: JSON.stringify([...base, ['customer_name', 'like', `%${query}%`]]),
    limit_page_length: 15,
    order_by: 'posting_date desc',
  }))

  const [r1, r2] = await Promise.all([byName, byCust])
  const seen = new Set()
  return [...r1.data, ...r2.data].filter((inv) => {
    if (seen.has(inv.name)) return false
    seen.add(inv.name)
    return true
  })
}

// Fetch a single POS Invoice with all its items
export async function getPOSInvoiceDetail(name) {
  const data = await request('GET', `/api/resource/POS Invoice/${encodeURIComponent(name)}`)
  return data.data
}

// Create and submit a return POS Invoice against an original invoice.
// returnItems: [{ item_code, item_name, qty (positive), rate, uom, warehouse }]
// Returns the submitted doc name.
export async function submitReturnInvoice(originalDoc, returnItems, posProfile, posOpeningEntry) {
  const today = new Date().toISOString().split('T')[0]

  // Build item rows: copy every field from the original item so ERPNext has all
  // back-references it needs for return validation. Strip 'name' (child row docname)
  // to avoid triggering an update instead of insert. Flip qty to negative.
  const items = returnItems.map((originalItem) => {
    // eslint-disable-next-line no-unused-vars
    const { name: _childName, ...rest } = originalItem
    return {
      ...rest,
      qty:                -Math.abs(originalItem.qty),
      // sales_invoice_item links this return row to the original invoice row
      sales_invoice_item: originalItem.name,
    }
  })

  // Mirror the original invoice's payments with negative amounts (matches ERPNext web UI behaviour)
  const payments = (originalDoc.payments || []).map((p) => ({
    mode_of_payment: p.mode_of_payment,
    amount:          -(Math.abs(p.amount) || 0),
  }))
  if (payments.length === 0) payments.push({ mode_of_payment: 'Cash', amount: 0 })

  const payload = {
    doctype:           'POS Invoice',
    is_return:         1,
    return_against:    originalDoc.name,
    pos_profile:       posProfile,
    company:           originalDoc.company,
    currency:          originalDoc.currency,
    customer:          originalDoc.customer,
    posting_date:      today,
    set_warehouse:     originalDoc.set_warehouse,
    pos_opening_entry: posOpeningEntry,
    items,
    payments,
  }

  const draft     = await request('POST', '/api/resource/POS Invoice', payload)
  const doc       = draft.data
  const submitted = await request('POST', '/api/method/frappe.client.submit', { doc })
  return submitted.message || submitted
}

// ─── POS Opening / Closing Entry ─────────────────────────────────────────────

// ERPNext expects datetime in the server's local timezone (YYYY-MM-DD HH:MM:SS).
// Using UTC (toISOString) causes silent mismatches on non-UTC servers.
function localNow() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export async function getOpenPOSSession(posProfile) {
  const params = {
    filters: JSON.stringify([
      ['pos_profile', '=', posProfile],
      ['docstatus', '=', 1],
      ['status', '=', 'Open'],
    ]),
    fields: JSON.stringify(['name', 'period_start_date']),
    limit_page_length: 1,
    order_by: 'period_start_date desc',
  }
  const data = await request('GET', '/api/resource/POS Opening Entry' + qs(params))
  const found = data.data?.[0]
  if (!found) return null
  // Fetch full document so the balance_details child table is included
  // (list API never returns child table rows)
  const full = await request('GET', `/api/resource/POS Opening Entry/${encodeURIComponent(found.name)}`)
  return full.data
}

export async function createPOSOpeningEntry(posProfile, company, user, paymentMethods, openingCash) {
  const now = localNow()
  const balanceDetails = paymentMethods.map((mode) => ({
    mode_of_payment: mode,
    opening_amount: mode.toLowerCase().includes('cash') ? openingCash : 0,
  }))

  // Step 1: create draft
  const draft = await request('POST', '/api/resource/POS Opening Entry', {
    doctype: 'POS Opening Entry',
    pos_profile: posProfile,
    company,
    period_start_date: now,
    user,
    balance_details: balanceDetails,
  })
  if (!draft.data?.name) throw new Error('Opening entry created but no name returned')

  // Step 2: re-fetch full doc so we have the server's `modified` timestamp.
  // Submitting without the correct `modified` causes TimestampMismatchError.
  const full = await request('GET', `/api/resource/POS Opening Entry/${encodeURIComponent(draft.data.name)}`)
  const sub = await request('POST', '/api/method/frappe.client.submit', { doc: full.data })
  return sub.message || full.data
}

// Returns { invoices, creditInvoices, totalSales, creditTotal, byMode, count, creditCount }
export async function getTodayInvoiceSummary(posProfile, sessionStartDate, username) {
  const today = new Date().toISOString().split('T')[0]

  const posFilters = [
    ['pos_profile', '=', posProfile],
    ['posting_date', '=', today],
    ['docstatus', '=', 1],
  ]
  if (sessionStartDate) posFilters.push(['creation', '>=', sessionStartDate])

  const siFilters = [
    ['posting_date', '=', today],
    ['docstatus',    '=', 1],
    ['is_pos',       '=', 0],
  ]
  if (sessionStartDate) siFilters.push(['creation', '>=', sessionStartDate])
  if (username) siFilters.push(['owner', '=', username])

  // Fetch POS invoices and credit invoices in parallel
  const [invoicesRes, siRes] = await Promise.all([
    request('GET', '/api/resource/POS Invoice' + qs({
      filters:           JSON.stringify(posFilters),
      fields:            JSON.stringify(['name', 'grand_total', 'customer', 'consolidated_invoice']),
      limit_page_length: 500,
      order_by:          'creation desc',
    })),
    request('GET', '/api/resource/Sales Invoice' + qs({
      filters:           JSON.stringify(siFilters),
      fields:            JSON.stringify(['name', 'grand_total', 'customer']),
      limit_page_length: 500,
      order_by:          'creation desc',
    })).catch(() => ({ data: [] })),  // offline or permission issue — skip credit
  ])

  const invoices       = invoicesRes.data || []
  const creditInvoices = siRes.data || []

  const creditTotal = creditInvoices.reduce((s, i) => s + (i.grand_total || 0), 0)
  const totalSales  = invoices.reduce((s, i) => s + (i.grand_total || 0), 0) + creditTotal

  if (invoices.length === 0 && creditInvoices.length === 0) {
    return { invoices: [], creditInvoices: [], totalSales: 0, creditTotal: 0, byMode: {}, count: 0, creditCount: 0 }
  }

  // ── Payment breakdown (POS Invoices only) ────────────────────────────────
  const names = invoices.map((i) => i.name)
  let byMode = {}

  if (names.length > 0) {
    try {
      const paymentsRes = await request('GET', '/api/resource/Sales Invoice Payment' + qs({
        filters: JSON.stringify([
          ['parent',     'in', names],
          ['parenttype', '=', 'POS Invoice'],
        ]),
        fields: JSON.stringify(['mode_of_payment', 'amount']),
        limit_page_length: 2000,
      }))
      for (const p of paymentsRes.data || []) {
        if (p.amount > 0) byMode[p.mode_of_payment] = (byMode[p.mode_of_payment] || 0) + p.amount
      }
    } catch {
      for (const inv of invoices.slice(0, 200)) {
        try {
          const doc = await request('GET', `/api/resource/POS Invoice/${encodeURIComponent(inv.name)}`)
          for (const p of doc.data?.payments || []) {
            if (p.amount > 0) byMode[p.mode_of_payment] = (byMode[p.mode_of_payment] || 0) + p.amount
          }
        } catch { /* skip */ }
      }
    }
  }

  return {
    invoices, creditInvoices,
    totalSales, creditTotal,
    byMode,
    count: invoices.length,
    creditCount: creditInvoices.length,
  }
}

export async function closePOSSession(posOpeningEntry, posProfile, company, user, invoices, byMode, openingCash) {
  // Fetch the opening entry to get period_start_date and correct modified timestamp
  const openingRes = await request('GET', `/api/resource/POS Opening Entry/${encodeURIComponent(posOpeningEntry)}`)
  const startDate  = openingRes.data?.period_start_date || localNow()
  const now        = localNow()
  const today      = now.slice(0, 10)

  // Exclude invoices already merged into a previous closing entry — ERPNext
  // rejects them with "POS Invoice is already consolidated".
  const openInvoices = invoices.filter((inv) => !inv.consolidated_invoice)
  const posTransactions = openInvoices.map((inv) => ({
    pos_invoice:  inv.name,
    grand_total:  inv.grand_total,
    customer:     inv.customer || '',
    posting_date: today,
  }))

  // Build reconciliation starting from all modes in the opening entry, so every
  // configured payment method is present even if it had zero sales today.
  const openingModes = openingRes.data?.balance_details || []
  const reconMap = {}
  for (const b of openingModes) {
    const openAmt = b.opening_amount || 0
    reconMap[b.mode_of_payment] = {
      mode_of_payment: b.mode_of_payment,
      opening_amount:  openAmt,
      expected_amount: 0,
      // closing_amount starts at opening so ERPNext journals zero movement
      // when there are no sales for this mode (closing - opening = 0)
      closing_amount:  openAmt,
      difference:      0,
    }
  }
  // Overlay actual collected amounts.
  // expected_amount = opening + sales (total expected in drawer).
  // closing_amount  = opening + sales (cashier confirms full drawer amount).
  // ERPNext MODE OF PAYMENTS display = expected - opening = sales. ✓
  for (const [mode, amount] of Object.entries(byMode)) {
    if (reconMap[mode]) {
      const total = reconMap[mode].opening_amount + amount
      reconMap[mode].expected_amount = total
      reconMap[mode].closing_amount  = total
    } else {
      const openAmt = mode.toLowerCase().includes('cash') ? openingCash : 0
      const total   = openAmt + amount
      reconMap[mode] = {
        mode_of_payment: mode,
        opening_amount:  openAmt,
        expected_amount: total,
        closing_amount:  total,
        difference:      0,
      }
    }
  }
  const paymentReconciliation = Object.values(reconMap)

  // Step 1: create draft
  const draft = await request('POST', '/api/resource/POS Closing Entry', {
    doctype:                'POS Closing Entry',
    pos_profile:            posProfile,
    company,
    user,
    pos_opening_entry:      posOpeningEntry,
    period_start_date:      startDate,
    period_end_date:        now,
    pos_transactions:       posTransactions,
    payment_reconciliation: paymentReconciliation,
    ignore_pricing_rule:    1,   // prevent Standard Selling price list updates on consolidation
  })
  if (!draft.data?.name) throw new Error('Closing entry created but no name returned')

  // Step 2: re-fetch so submit receives the server's current `modified` timestamp
  const full = await request('GET', `/api/resource/POS Closing Entry/${encodeURIComponent(draft.data.name)}`)

  // Step 3: submit — ERPNext may return non-OK even on success if it emits
  // informational msgprint() messages (e.g. "Item Price updated for…") during
  // consolidation. Verify actual docstatus before treating it as an error.
  try {
    const sub = await request('POST', '/api/method/frappe.client.submit', { doc: full.data })
    return sub.message || full.data
  } catch (submitErr) {
    // Confirm whether the closing entry actually got submitted despite the error
    try {
      const check = await request('GET', `/api/resource/POS Closing Entry/${encodeURIComponent(draft.data.name)}`)
      if (check.data?.docstatus === 1) return check.data  // submitted — treat as success
    } catch {}
    throw submitErr  // genuinely failed
  }
}
