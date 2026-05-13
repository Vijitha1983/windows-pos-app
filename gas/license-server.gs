// ERPNext POS — License Activation Server
// Deploy as: Google Apps Script Web App
//   Execute as: Me
//   Who has access: Anyone
//
// Google Sheet: "POS Activations"
//   Col A: serial       — the 24-char key (e.g. FQQME-SXQ6Y-DSYDF-5BF82)
//   Col B: machineId    — filled on first activation
//   Col C: activatedAt  — ISO timestamp, filled on first activation
//   Col D: hostname     — filled on first activation
//   Col E: status       — "active" | "revoked" (leave blank = treated as active)
//
// Setup steps:
//   1. Paste this script into script.google.com
//   2. Set SHEET_ID to your spreadsheet's ID (from the URL)
//   3. Paste serial keys into column A (one per row, starting row 2)
//   4. Deploy → Manage deployments → edit → New version → Deploy
//   5. URL stays the same — no change needed in electron/license.js

var SHEET_ID   = 'YOUR_GOOGLE_SHEET_ID_HERE'  // ← replace with your sheet ID
var SHEET_NAME = 'POS Activations'
var TOKEN      = 'ERPNEXT-POS-ACTIVATE-2025'

// Column positions (0-based)
var COL_SERIAL  = 0  // A
var COL_MACHINE = 1  // B
var COL_DATE    = 2  // C
var COL_HOST    = 3  // D
var COL_STATUS  = 4  // E

function doGet(e) {
  var result = handleRequest(e)
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON)
}

function handleRequest(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {}

    if (p.token !== TOKEN) {
      return { ok: false, error: 'Unauthorized.' }
    }

    var action    = p.action     || ''
    var serial    = (p.serial    || '').toUpperCase().trim()
    var machineId = (p.machineId || '').trim()
    var hostname  = (p.hostname  || '').trim()
    var email     = (p.email     || '').trim()
    var phone     = (p.phone     || '').trim()
    var company   = (p.company   || '').trim()

    if (!serial || !machineId) {
      return { ok: false, error: 'Missing parameters.' }
    }

    if (action === 'activate') return doActivate(serial, machineId, hostname, email, phone, company)
    if (action === 'verify')   return doVerify(serial, machineId)

    return { ok: false, error: 'Unknown action.' }

  } catch (err) {
    Logger.log('Unhandled error: ' + err.toString() + '\n' + err.stack)
    return { ok: false, error: 'Internal server error. Please try again.' }
  }
}

// ── Shared row lookup ─────────────────────────────────────────────────────────

function findRow(sheet, serial) {
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return null

  var serialCol = sheet.getRange(2, COL_SERIAL + 1, lastRow - 1, 1).getValues()
  for (var i = 0; i < serialCol.length; i++) {
    if (String(serialCol[i][0] || '').toUpperCase().trim() === serial) {
      var sheetRow = i + 2
      var rowData  = sheet.getRange(sheetRow, 1, 1, 5).getValues()[0]
      return { sheetRow: sheetRow, rowData: rowData }
    }
  }
  return null
}

function openSheet() {
  var ss    = SpreadsheetApp.openById(SHEET_ID)
  var sheet = ss.getSheetByName(SHEET_NAME)
  if (!sheet) Logger.log('Sheet not found: ' + SHEET_NAME)
  return sheet
}

// ── Activate ──────────────────────────────────────────────────────────────────

function doActivate(serial, machineId, hostname, email, phone, company) {
  var sheet = openSheet()
  if (!sheet) return { ok: false, error: 'Configuration error — sheet not found.' }

  var found = findRow(sheet, serial)
  if (!found) return { ok: false, error: 'License key not found. Please check the key and try again.' }

  var stored = String(found.rowData[COL_MACHINE] || '').trim()
  var status = String(found.rowData[COL_STATUS]  || '').toLowerCase().trim()

  if (status === 'revoked') {
    return { ok: false, error: 'This license has been revoked. Contact your vendor.' }
  }

  if (!stored) {
    // First activation — bind to this machine
    sheet.getRange(found.sheetRow, COL_MACHINE + 1).setValue(machineId)
    sheet.getRange(found.sheetRow, COL_DATE    + 1).setValue(new Date().toISOString())
    sheet.getRange(found.sheetRow, COL_HOST    + 1).setValue(hostname)
    sheet.getRange(found.sheetRow, COL_STATUS  + 1).setValue('active')
    SpreadsheetApp.flush()
    return { ok: true }
  }

  if (stored === machineId) {
    // Same machine re-activating (reinstall / repair) — allow
    return { ok: true }
  }

  return {
    ok: false,
    error: 'This license is already activated on another machine. Contact your vendor to transfer it.'
  }
}

// ── Verify ────────────────────────────────────────────────────────────────────
// Called on app startup (every 8 h when online) to confirm this machine still
// holds the licence. Returns ok:false if another machine has taken it over or
// the key has been revoked, triggering an automatic local revocation.

function doVerify(serial, machineId) {
  var sheet = openSheet()
  if (!sheet) return { ok: true }  // sheet misconfigured — don't revoke, let admin fix it

  var found = findRow(sheet, serial)
  if (!found) return { ok: false, error: 'License key not found.' }

  var stored = String(found.rowData[COL_MACHINE] || '').trim()
  var status = String(found.rowData[COL_STATUS]  || '').toLowerCase().trim()

  if (status === 'revoked') {
    return { ok: false, error: 'This license has been revoked. Contact your vendor.' }
  }

  if (!stored) {
    // Serial in sheet but never properly activated (no machineId written) — allow
    return { ok: true }
  }

  if (stored === machineId) return { ok: true }

  // This machine's ID doesn't match what the sheet has recorded
  return { ok: false, error: 'License is registered to a different machine.' }
}
