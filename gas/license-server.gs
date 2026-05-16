// ERPNext POS — License Activation Server
// Deploy as: Google Apps Script Web App
//   Execute as: Me
//   Who has access: Anyone
//
// Google Sheet: "POS Activations"
//   Col A: serial       — the 24-char key (e.g. FQQME-SXQ6Y-DSYDF-5BF82)
//   Col B: machineId    — filled on first activation
//   Col C: activatedAt  — ISO timestamp
//   Col D: hostname     — filled on first activation
//   Col E: status       — "active" | "registered" | "revoked" (blank = untouched)
//   Col F: email        — filled on preregister / activate
//   Col G: phone        — filled on preregister / activate
//   Col H: company      — filled on preregister / activate
//
// Actions:
//   preregister — called by the NSIS installer; validates serial and stores
//                 email/phone/company; does NOT require machineId
//   activate    — called by the app on first run; binds machineId to serial
//   verify      — called every 8 h by the app to confirm machine still holds the licence
//
// Setup:
//   1. Paste this into script.google.com
//   2. Set SHEET_ID below to your spreadsheet ID (from the URL)
//   3. Add serial keys in column A (row 2 onward)
//   4. Deploy → Manage deployments → Edit → New version → Deploy
//      (URL remains the same — no change needed in electron/license.js)

var SHEET_ID   = '1IZyeN3nobnqZTwvzj_0zWis_Z2TrRg70o5vV7ytPsDc'
var SHEET_NAME = 'POS Activations'
var TOKEN      = 'ERPNEXT-POS-ACTIVATE-2025'

// Column positions (1-based for getRange, 0-based for rowData array)
var COL_SERIAL  = 0  // A
var COL_MACHINE = 1  // B
var COL_DATE    = 2  // C
var COL_HOST    = 3  // D
var COL_STATUS  = 4  // E
var COL_EMAIL   = 5  // F
var COL_PHONE   = 6  // G
var COL_COMPANY = 7  // H

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

    if (!serial) {
      return { ok: false, error: 'Missing serial.' }
    }

    // preregister does not require machineId — all other actions do
    if (action !== 'preregister' && !machineId) {
      return { ok: false, error: 'Missing machineId.' }
    }

    if (action === 'preregister') return doPreregister(serial, email, phone, company)
    if (action === 'activate')    return doActivate(serial, machineId, hostname, email, phone, company)
    if (action === 'verify')      return doVerify(serial, machineId)

    return { ok: false, error: 'Unknown action.' }

  } catch (err) {
    Logger.log('Unhandled error: ' + err.toString() + '\n' + err.stack)
    return { ok: false, error: 'Internal server error. Please try again.' }
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function openSheet() {
  var ss    = SpreadsheetApp.openById(SHEET_ID)
  var sheet = ss.getSheetByName(SHEET_NAME)
  if (!sheet) Logger.log('Sheet not found: ' + SHEET_NAME)
  return sheet
}

function findRow(sheet, serial) {
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return null

  var serialCol = sheet.getRange(2, COL_SERIAL + 1, lastRow - 1, 1).getValues()
  for (var i = 0; i < serialCol.length; i++) {
    if (String(serialCol[i][0] || '').toUpperCase().trim() === serial) {
      var sheetRow = i + 2
      // Read all 8 columns so email/phone/company are available
      var numCols  = sheet.getLastColumn()
      var readCols = Math.max(numCols, 8)
      var rowData  = sheet.getRange(sheetRow, 1, 1, readCols).getValues()[0]
      return { sheetRow: sheetRow, rowData: rowData }
    }
  }
  return null
}

// ── Pre-register (called by the NSIS installer) ───────────────────────────────
// Validates that the serial exists and is not revoked, then stores
// email / phone / company so the Google Sheet is updated during installation
// (before the app runs for the first time).

function doPreregister(serial, email, phone, company) {
  var sheet = openSheet()
  if (!sheet) return { ok: false, error: 'Configuration error — sheet not found.' }

  var found = findRow(sheet, serial)
  if (!found) return { ok: false, error: 'License key not found. Please check the key and try again.' }

  var status = String(found.rowData[COL_STATUS] || '').toLowerCase().trim()
  if (status === 'revoked') {
    return { ok: false, error: 'This license has been revoked. Contact your vendor.' }
  }

  // Write email / phone / company
  sheet.getRange(found.sheetRow, COL_EMAIL   + 1).setValue(email)
  sheet.getRange(found.sheetRow, COL_PHONE   + 1).setValue(phone)
  sheet.getRange(found.sheetRow, COL_COMPANY + 1).setValue(company)

  // Mark as 'registered' only if the serial hasn't been activated yet
  if (!status || status === 'available' || status === 'sold') {
    sheet.getRange(found.sheetRow, COL_STATUS + 1).setValue('registered')
  }

  SpreadsheetApp.flush()
  return { ok: true }
}

// ── Activate (called by the app on first run) ─────────────────────────────────

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
    // First machine binding — write all details
    sheet.getRange(found.sheetRow, COL_MACHINE + 1).setValue(machineId)
    sheet.getRange(found.sheetRow, COL_DATE    + 1).setValue(new Date().toISOString())
    sheet.getRange(found.sheetRow, COL_HOST    + 1).setValue(hostname)
    sheet.getRange(found.sheetRow, COL_STATUS  + 1).setValue('active')
    if (email)   sheet.getRange(found.sheetRow, COL_EMAIL   + 1).setValue(email)
    if (phone)   sheet.getRange(found.sheetRow, COL_PHONE   + 1).setValue(phone)
    if (company) sheet.getRange(found.sheetRow, COL_COMPANY + 1).setValue(company)
    SpreadsheetApp.flush()
    return { ok: true }
  }

  if (stored === machineId) {
    // Same machine re-activating (reinstall / repair) — allow; refresh contact info
    sheet.getRange(found.sheetRow, COL_DATE + 1).setValue(new Date().toISOString())
    if (email)   sheet.getRange(found.sheetRow, COL_EMAIL   + 1).setValue(email)
    if (phone)   sheet.getRange(found.sheetRow, COL_PHONE   + 1).setValue(phone)
    if (company) sheet.getRange(found.sheetRow, COL_COMPANY + 1).setValue(company)
    SpreadsheetApp.flush()
    return { ok: true }
  }

  return {
    ok: false,
    error: 'This license is already activated on another machine. Contact your vendor to transfer it.'
  }
}

// ── Verify (called every 8 h by the running app) ─────────────────────────────

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

  if (!stored) return { ok: true }         // never bound — allow
  if (stored === machineId) return { ok: true }  // same machine — allow

  return { ok: false, error: 'License is registered to a different machine.' }
}
