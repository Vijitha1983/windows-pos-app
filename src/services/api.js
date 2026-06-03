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
// Fetches each invoice document individually so the items child table (including
// item_group) is always present — the bulk child-table query endpoint is unreliable
// across ERPNext versions and returns empty results in some configurations.
export async function getCategoryWiseSales(invoiceNames, creditInvoiceNames = []) {
  if ((!invoiceNames || invoiceNames.length === 0) && creditInvoiceNames.length === 0) return {}

  const [posResults, siResults] = await Promise.all([
    Promise.all((invoiceNames || []).map((name) =>
      request('GET', `/api/resource/POS Invoice/${encodeURIComponent(name)}`)
        .then((res) => res.data?.items || [])
        .catch(() => [])
    )),
    Promise.all((creditInvoiceNames || []).map((name) =>
      request('GET', `/api/resource/Sales Invoice/${encodeURIComponent(name)}`)
        .then((res) => res.data?.items || [])
        .catch(() => [])
    )),
  ])

  const allItems = [...posResults.flat(), ...siResults.flat()]
    .filter((item) => item.item_code && parseFloat(item.amount) > 0)

  if (allItems.length === 0) return {}

  const result = {}
  for (const item of allItems) {
    const grp = item.item_group || 'Other'
    result[grp] = (result[grp] || 0) + parseFloat(item.amount)
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

// Marks a redeemed gift voucher serial as Inactive so it cannot be reused.
// Called after successful invoice submission. Uses allSettled at call site so failures don't block checkout.
export async function markSerialNoUsed(serialNo) {
  return request('PUT', `/api/resource/Serial No/${encodeURIComponent(serialNo)}`, { status: 'Inactive' })
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

// ─── Promotional Schemes ─────────────────────────────────────────────────────

// Fetches all active selling promotional schemes with their slab child tables.
// Returns full scheme docs so the caller can match item + qty locally without extra requests.
export async function getPromotionalSchemes() {
  const listData = await request('GET', '/api/resource/Promotional Scheme' + qs({
    filters: JSON.stringify([['selling', '=', 1], ['disable', '=', 0]]),
    fields:  JSON.stringify(['name']),
    limit_page_length: 100,
  }))
  const names = (listData.data || []).map((s) => s.name)
  if (names.length === 0) return []

  const docs = await Promise.all(
    names.map((name) =>
      request('GET', `/api/resource/Promotional Scheme/${encodeURIComponent(name)}`)
        .then((res) => res.data)
        .catch((e) => { console.warn('[PROMO] failed to fetch scheme', name, e?.message); return null })
    )
  )
  const result = docs.filter(Boolean)
  console.log('[PROMO] fetched', result.length, 'schemes:', result.map(s => `${s.name}(${s.price_or_product_discount})`))
  return result
}

// ─── Item Tax Templates ───────────────────────────────────────────────────────

// Batch-fetches item_tax_template for a list of item codes from ERPNext's
// Item Tax child table. Returns a map of { item_code: item_tax_template }.
// Prefers rows with no tax_category set (applies to all customers).
export async function getItemTaxTemplates(itemCodes) {
  if (!itemCodes?.length) return {}
  try {
    const data = await request('GET', '/api/resource/Item Tax' + qs({
      filters:           JSON.stringify([['parent', 'in', itemCodes]]),
      fields:            JSON.stringify(['parent', 'item_tax_template', 'tax_category', 'valid_from']),
      limit_page_length: itemCodes.length * 5,
    }))
    const map = {}
    for (const row of (data.data || [])) {
      // Prefer rows with no tax_category (universal) over category-specific ones
      if (!map[row.parent] || !row.tax_category) {
        map[row.parent] = row.item_tax_template
      }
    }
    return map
  } catch {
    return {}
  }
}

// ─── Tax Rules ───────────────────────────────────────────────────────────────

// Resolves the applicable Sales Taxes and Charges Template via Tax Rule
// (matching tax_category + company + selling=1), then returns the template
// name and its tax rows. Returns null when no matching rule is found.
export async function getApplicableTaxes(company, taxCategory) {
  if (!taxCategory || !company) return null
  try {
    const rules = await request('GET', '/api/resource/Tax Rule' + qs({
      filters: JSON.stringify([
        ['company',      '=', company],
        ['tax_category', '=', taxCategory],
        ['selling',      '=', 1],
      ]),
      fields:            JSON.stringify(['name', 'sales_tax_template']),
      limit_page_length: 5,
      order_by:          'priority desc',
    }))
    const template = (rules.data || []).find((r) => r.sales_tax_template)?.sales_tax_template
    if (!template) return null
    const tmpl = await request('GET', `/api/resource/Sales Taxes and Charges Template/${encodeURIComponent(template)}`)
    return { taxes_and_charges: template, taxes: tmpl.data?.taxes || [] }
  } catch (e) {
    console.warn('[TAX] Tax Rule lookup failed:', e?.message)
    return null
  }
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

// Exact barcode lookup — item_code exact match first, then Item Barcode table.
// Each step is independent so a failure in one does not break the other.
export async function searchItemByBarcode(barcode) {
  const base = [['disabled', '=', 0], ['is_sales_item', '=', 1]]
  // Step 1: exact item_code match (fastest — most shops use item_code as barcode)
  try {
    const res = await request('GET', '/api/resource/Item' + qs({
      fields: ITEM_FIELDS,
      filters: JSON.stringify([...base, ['item_code', '=', barcode]]),
      limit_page_length: 1,
    }))
    if (res.data?.length > 0) return res.data
  } catch {}
  // Step 2: Item Barcode child table (shops that store barcodes separately)
  try {
    const barcodeRes = await request('GET', '/api/resource/Item Barcode' + qs({
      fields: JSON.stringify(['parent']),
      filters: JSON.stringify([['barcode', '=', barcode]]),
      limit_page_length: 1,
    }))
    if (barcodeRes.data?.length > 0) {
      const code = barcodeRes.data[0].parent
      const itemRes = await request('GET', '/api/resource/Item' + qs({
        fields: ITEM_FIELDS,
        filters: JSON.stringify([...base, ['item_code', '=', code]]),
        limit_page_length: 1,
      }))
      if (itemRes.data?.length > 0) return itemRes.data
    }
  } catch {}
  return []
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
    fields: JSON.stringify(['name', 'customer_name', 'mobile_no', 'tax_category']),
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

// Fetch recent POS invoices (all, including returns) for Bill Recall view
export async function getRecentPOSInvoices(posProfile, limit = 40) {
  const apiFilters = [['docstatus', '=', 1]]
  if (posProfile) apiFilters.push(['pos_profile', '=', posProfile])
  const data = await request('GET', '/api/resource/POS Invoice' + qs({
    fields: JSON.stringify(['name', 'customer_name', 'grand_total', 'posting_date', 'is_return']),
    filters: JSON.stringify(apiFilters),
    limit_page_length: limit,
    order_by: 'posting_date desc',
  }))
  return data.data
}

// Search all submitted POS invoices by name or customer (includes returns)
export async function searchAllPOSInvoices(query, posProfile) {
  const base = [['docstatus', '=', 1]]
  if (posProfile) base.push(['pos_profile', '=', posProfile])
  const fields = JSON.stringify(['name', 'customer_name', 'grand_total', 'posting_date', 'is_return'])
  const [r1, r2] = await Promise.all([
    request('GET', '/api/resource/POS Invoice' + qs({
      fields, order_by: 'posting_date desc', limit_page_length: 20,
      filters: JSON.stringify([...base, ['name', 'like', `%${query}%`]]),
    })),
    request('GET', '/api/resource/POS Invoice' + qs({
      fields, order_by: 'posting_date desc', limit_page_length: 20,
      filters: JSON.stringify([...base, ['customer_name', 'like', `%${query}%`]]),
    })),
  ])
  const seen = new Set()
  return [...r1.data, ...r2.data].filter((inv) => {
    if (seen.has(inv.name)) return false
    seen.add(inv.name)
    return true
  })
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
  const candidates = [...r1.data, ...r2.data].filter((inv) => {
    if (seen.has(inv.name)) return false
    seen.add(inv.name)
    return true
  })

  if (candidates.length === 0) return []

  // Exclude invoices that already have a submitted return allocated against them
  try {
    const returnedRes = await request('GET', '/api/resource/POS Invoice' + qs({
      fields:            JSON.stringify(['return_against']),
      filters:           JSON.stringify([
        ['docstatus',       '=', 1],
        ['is_return',       '=', 1],
        ['return_against',  'in', candidates.map((i) => i.name)],
      ]),
      limit_page_length: 500,
    }))
    const alreadyReturned = new Set((returnedRes.data || []).map((r) => r.return_against))
    return candidates.filter((inv) => !alreadyReturned.has(inv.name))
  } catch {
    return candidates   // fallback: show all if the extra check fails
  }
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

  const items = returnItems.map((originalItem) => ({
    item_code: originalItem.item_code,
    item_name: originalItem.item_name,
    qty:       -Math.abs(originalItem.qty),
    rate:      originalItem.rate,
    uom:       originalItem.uom || 'Nos',
    warehouse: originalItem.warehouse || originalDoc.set_warehouse,
    ...(originalItem.item_tax_template ? { item_tax_template: originalItem.item_tax_template } : {}),
    ...(originalItem.serial_no ? { serial_no: originalItem.serial_no } : {}),
    ...(originalItem.batch_no  ? { batch_no:  originalItem.batch_no  } : {}),
  }))

  const returnTotal = returnItems.reduce((sum, i) => sum + Math.abs(i.qty) * (i.rate || 0), 0)

  // Always use Cash as the return payment mode for both refund and exchange.
  // Refund:   Cr Cash 1,900 — cash physically left the drawer ✓
  // Exchange: Cr Cash 1,900 — cancelled by the new sale invoice which posts
  //           Dr Cash 1,900 as part of the return credit payment row, so the
  //           net cash effect is zero for the return leg, correct for exchange.
  const payments = [{ mode_of_payment: 'Cash', amount: -returnTotal }]

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
    paid_amount:       -returnTotal,
    items,
    payments,
    ...(originalDoc.taxes_and_charges ? { taxes_and_charges: originalDoc.taxes_and_charges } : {}),
    ...(originalDoc.taxes?.length     ? { taxes: originalDoc.taxes }                         : {}),
  }

  let draft
  try {
    draft = await request('POST', '/api/resource/POS Invoice', payload)
  } catch (err) {
    console.error('[Return] create failed — message:', err?.message)
    console.error('[Return] full traceback:\n', err?.response?.data?.exc)
    throw err
  }
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

// Returns { invoices, creditInvoices, totalSales, creditTotal, byMode, returnTotal, count, creditCount, returnCount }
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

  const invoiceFields = JSON.stringify(['name', 'grand_total', 'change_amount', 'customer', 'consolidated_invoice', 'is_return', 'return_against'])

  // Three parallel fetches: regular invoices, return invoices, credit (Sales) invoices
  // Splitting regular vs return server-side avoids relying on is_return being truthy in the response.
  const [regularRes, returnRes, siRes] = await Promise.all([
    request('GET', '/api/resource/POS Invoice' + qs({
      filters:           JSON.stringify([...posFilters, ['is_return', '=', 0]]),
      fields:            invoiceFields,
      limit_page_length: 500,
      order_by:          'creation desc',
    })),
    request('GET', '/api/resource/POS Invoice' + qs({
      filters:           JSON.stringify([...posFilters, ['is_return', '=', 1]]),
      fields:            invoiceFields,
      limit_page_length: 500,
      order_by:          'creation desc',
    })).catch(() => ({ data: [] })),
    request('GET', '/api/resource/Sales Invoice' + qs({
      filters:           JSON.stringify(siFilters),
      fields:            JSON.stringify(['name', 'grand_total', 'customer']),
      limit_page_length: 500,
      order_by:          'creation desc',
    })).catch(() => ({ data: [] })),
  ])

  const regularInvoices = regularRes.data  || []
  const returnInvoices  = returnRes.data   || []
  const allInvoices     = [...regularInvoices, ...returnInvoices]
  const returnInvCount  = returnInvoices.length
  const creditInvoices  = siRes.data || []

  const creditTotal = creditInvoices.reduce((s, i) => s + (i.grand_total || 0), 0)
  // Gross sales = sum of regular (non-return) invoices only
  const totalSales  = regularInvoices.reduce((s, i) => s + (i.grand_total || 0), 0) + creditTotal

  if (allInvoices.length === 0 && creditInvoices.length === 0) {
    return { invoices: [], creditInvoices: [], totalSales: 0, creditTotal: 0, byMode: {}, returnTotal: 0, count: 0, creditCount: 0, returnCount: 0 }
  }

  // ── Payment breakdown ────────────────────────────────────────────────────
  // byMode     = net (all invoices incl. returns) — used for cashier formula
  // byModeGross = gross from regular invoices only — used for sales display rows
  // Return invoice payments are negative; they correctly net byMode['Cash'] for
  // the cashier, but must NOT reduce the "Cash Sales" display figure.
  const names        = allInvoices.map((i) => i.name)
  const regularNames = new Set(regularInvoices.map((i) => i.name))
  // grossNames = regular invoices eligible for "Cash Sales" gross.
  // Exchange-return originals must be excluded (replaced by the new invoice).
  // Detection strategy: fetch payment accounts — exchange credit payments on the replacement
  // invoice use the AR/receivable account, not the cash account. Resolved after payment fetch.
  const grossNames = new Set(regularInvoices.map(i => i.name))
  let byMode      = {}
  let byModeGross = {}
  let returnByMode = {}
  let returnTotal = 0

  if (names.length > 0) {
    try {
      const paymentsRes = await request('GET', '/api/resource/Sales Invoice Payment' + qs({
        filters: JSON.stringify([
          ['parent',     'in', names],
          ['parenttype', '=', 'POS Invoice'],
        ]),
        fields: JSON.stringify(['parent', 'mode_of_payment', 'amount']),
        limit_page_length: 2000,
      }))
      for (const p of paymentsRes.data || []) {
        byMode[p.mode_of_payment] = (byMode[p.mode_of_payment] || 0) + p.amount
        if (p.amount < 0) {
          returnTotal += Math.abs(p.amount)
          if (!regularNames.has(p.parent)) {
            returnByMode[p.mode_of_payment] = (returnByMode[p.mode_of_payment] || 0) + Math.abs(p.amount)
          }
        }
        if (grossNames.has(p.parent) && p.amount > 0) {
          byModeGross[p.mode_of_payment] = (byModeGross[p.mode_of_payment] || 0) + p.amount
        }
      }
    } catch {
      for (const inv of allInvoices.slice(0, 200)) {
        try {
          const doc = await request('GET', `/api/resource/POS Invoice/${encodeURIComponent(inv.name)}`)
          for (const p of doc.data?.payments || []) {
            byMode[p.mode_of_payment] = (byMode[p.mode_of_payment] || 0) + p.amount
            if (p.amount < 0) {
              returnTotal += Math.abs(p.amount)
              if (!regularNames.has(inv.name)) {
                returnByMode[p.mode_of_payment] = (returnByMode[p.mode_of_payment] || 0) + Math.abs(p.amount)
              }
            }
            if (grossNames.has(inv.name) && p.amount > 0) {
              byModeGross[p.mode_of_payment] = (byModeGross[p.mode_of_payment] || 0) + p.amount
            }
          }
        } catch { /* skip */ }
      }
    }
  }

  // Cash given back to customers (overpayment change + return credit surplus)
  // Only count regular (non-return) invoices — return invoices don't give change.
  const totalChangeGiven = regularInvoices.reduce((s, i) => s + (parseFloat(i.change_amount) || 0), 0)

  return {
    invoices: allInvoices, creditInvoices,
    totalSales, creditTotal,
    byMode,
    byModeGross,
    returnByMode,
    returnTotal,
    totalChangeGiven,
    count: regularInvoices.length,
    creditCount: creditInvoices.length,
    returnCount: returnInvCount,
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

  // ERPNext requires a return invoice's original to be consolidated before or
  // alongside the return. If the original is from a previous session and was
  // never consolidated, add it to pos_transactions so ERPNext can process them
  // together and satisfy the validation.
  const includedNames = new Set(posTransactions.map((t) => t.pos_invoice))
  for (const inv of openInvoices) {
    if (inv.is_return && inv.return_against && !includedNames.has(inv.return_against)) {
      try {
        const origRes = await request('GET', `/api/resource/POS Invoice/${encodeURIComponent(inv.return_against)}`)
        const orig = origRes.data
        if (orig && !orig.consolidated_invoice) {
          posTransactions.unshift({
            pos_invoice:  orig.name,
            grand_total:  orig.grand_total,
            customer:     orig.customer || '',
            posting_date: orig.posting_date || today,
          })
          includedNames.add(orig.name)
        }
      } catch { /* original not found or already handled — proceed */ }
    }
  }

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
