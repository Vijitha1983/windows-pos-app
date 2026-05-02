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
    // Fall back to message → exc_type so the user sees something meaningful.
    let msg = result.data?.message || ''
    if (!msg && result.data?._server_messages) {
      try {
        const parsed = JSON.parse(result.data._server_messages)
        msg = parsed
          .map((m) => { try { return JSON.parse(m).message } catch { return m } })
          .filter(Boolean)
          .join('\n')
      } catch {}
    }
    if (!msg) msg = result.data?.exc_type || result.message || `HTTP ${result.status}`
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

// Returns { [item_group]: total_amount } for the given POS invoice names.
// Tries POS Invoice Item first; falls back to Sales Invoice Item.
export async function getCategoryWiseSales(invoiceNames) {
  if (!invoiceNames || invoiceNames.length === 0) return {}
  const tryFetch = async (doctype, extraFilter = []) => {
    const data = await request('GET', `/api/resource/${doctype}` + qs({
      filters: JSON.stringify([['parent', 'in', invoiceNames], ...extraFilter]),
      fields: JSON.stringify(['item_group', 'amount']),
      limit_page_length: 5000,
    }))
    const map = {}
    for (const row of data.data || []) {
      if (row.item_group && row.amount > 0) {
        map[row.item_group] = (map[row.item_group] || 0) + row.amount
      }
    }
    return map
  }
  try { return await tryFetch('POS Invoice Item') } catch {}
  try { return await tryFetch('Sales Invoice Item', [['parenttype', '=', 'POS Invoice']]) } catch {}
  return {}
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

// ─── POS Invoice ─────────────────────────────────────────────────────────────

// Step 1: create a draft (docstatus=0), returns the saved doc with its name
export async function createPOSInvoice(invoiceData) {
  const data = await request('POST', '/api/resource/POS Invoice', invoiceData)
  return data.data
}

// Step 2: submit the draft — re-fetch first to get the server's `modified` timestamp.
// Passing only { doctype, name } causes TimestampMismatchError on some ERPNext versions.
export async function submitPOSInvoice(docName) {
  const full = await request('GET', `/api/resource/POS Invoice/${encodeURIComponent(docName)}`)
  const data = await request('POST', '/api/method/frappe.client.submit', { doc: full.data })
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

// Returns { invoices, totalSales, byMode, count }
// byMode = { 'Cash': 30000, 'Card': 15000, ... }
export async function getTodayInvoiceSummary(posProfile, sessionStartDate) {
  const today = new Date().toISOString().split('T')[0]
  const filters = [
    ['pos_profile', '=', posProfile],
    ['posting_date', '=', today],
    ['docstatus', '=', 1],
  ]
  // Scope to invoices created at or after this session started — more reliable than
  // filtering by pos_opening_entry because ERPNext may not store that link on the
  // invoice in all versions.
  if (sessionStartDate) filters.push(['creation', '>=', sessionStartDate])

  const invoicesRes = await request('GET', '/api/resource/POS Invoice' + qs({
    filters: JSON.stringify(filters),
    fields: JSON.stringify(['name', 'grand_total', 'customer', 'consolidated_invoice']),
    limit_page_length: 500,
    order_by: 'creation desc',
  }))
  const invoices = invoicesRes.data || []
  const totalSales = invoices.reduce((s, i) => s + (i.grand_total || 0), 0)
  if (invoices.length === 0) return { invoices, totalSales: 0, byMode: {}, count: 0 }

  const names = invoices.map((i) => i.name)
  let byMode = {}

  // Attempt 1: batch query the child payment table (fast, but requires list permission)
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
    // Attempt 2: fetch each invoice individually — slower but works without child-table permissions
    for (const inv of invoices.slice(0, 200)) {
      try {
        const doc = await request('GET', `/api/resource/POS Invoice/${encodeURIComponent(inv.name)}`)
        for (const p of doc.data?.payments || []) {
          if (p.amount > 0) byMode[p.mode_of_payment] = (byMode[p.mode_of_payment] || 0) + p.amount
        }
      } catch { /* skip */ }
    }
  }

  return { invoices, totalSales, byMode, count: invoices.length }
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
    reconMap[b.mode_of_payment] = {
      mode_of_payment: b.mode_of_payment,
      opening_amount:  b.opening_amount || 0,
      expected_amount: 0,
      closing_amount:  0,
      difference:      0,
    }
  }
  // Overlay actual collected amounts
  for (const [mode, amount] of Object.entries(byMode)) {
    if (reconMap[mode]) {
      reconMap[mode].expected_amount = amount
      reconMap[mode].closing_amount  = amount
    } else {
      reconMap[mode] = {
        mode_of_payment: mode,
        opening_amount:  mode.toLowerCase().includes('cash') ? openingCash : 0,
        expected_amount: amount,
        closing_amount:  amount,
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
  })
  if (!draft.data?.name) throw new Error('Closing entry created but no name returned')

  // Step 2: re-fetch so submit receives the server's current `modified` timestamp
  const full = await request('GET', `/api/resource/POS Closing Entry/${encodeURIComponent(draft.data.name)}`)
  const sub  = await request('POST', '/api/method/frappe.client.submit', { doc: full.data })
  return sub.message || full.data
}
