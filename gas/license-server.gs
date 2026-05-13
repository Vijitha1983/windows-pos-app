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
//   Col E: status       — "active" | "revoked" (leave blank = active when serial added)
//
// Setup steps:
//   1. Paste this script into script.google.com
//   2. Set SHEET_ID to your spreadsheet's ID (from the URL)
//   3. Paste serial keys into column A (one per row, starting row 2)
//   4. Deploy → New deployment → Web app (Execute as: Me, Anyone can access)
//   5. Copy the deployment URL into electron/license.js → SERVER_URL

var SHEET_ID   = 'YOUR_GOOGLE_SHEET_ID_HERE'  // ← replace with your sheet ID
var SHEET_NAME = 'POS Activations'             // must match the sheet tab name
var TOKEN      = 'ERPNEXT-POS-ACTIVATE-2025'  // must match electron/license.js

// Column positions (0-based, matching the sheet header row)
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

    if (!serial || !machineId) {
      return { ok: false, error: 'Missing parameters.' }
    }

    if (action === 'activate') {
      return doActivate(serial, machineId, hostname)
    }

    return { ok: false, error: 'Unknown action.' }

  } catch (err) {
    Logger.log('Unhandled error: ' + err.toString() + '\n' + err.stack)
    return { ok: false, error: 'Internal server error. Please try again.' }
  }
}

function doActivate(serial, machineId, hostname) {
  var ss    = SpreadsheetApp.openById(SHEET_ID)
  var sheet = ss.getSheetByName(SHEET_NAME)
  if (!sheet) {
    Logger.log('Sheet not found: ' + SHEET_NAME)
    return { ok: false, error: 'Configuration error — sheet not found.' }
  }

  var lastRow = sheet.getLastRow()
  if (lastRow < 2) {
    // Sheet has only the header row — no serials loaded yet
    return { ok: false, error: 'License key not found. Please check the key and try again.' }
  }

  // Read only the serial column (A) to find the row quickly, then read the full row
  var serialCol = sheet.getRange(2, COL_SERIAL + 1, lastRow - 1, 1).getValues()

  for (var i = 0; i < serialCol.length; i++) {
    var rowSerial = String(serialCol[i][0] || '').toUpperCase().trim()
    if (rowSerial !== serial) continue

    // Row found — read remaining columns
    var sheetRow  = i + 2  // +1 for 1-based, +1 for header
    var rowData   = sheet.getRange(sheetRow, 1, 1, 5).getValues()[0]
    var stored    = String(rowData[COL_MACHINE] || '').trim()
    var status    = String(rowData[COL_STATUS]  || '').toLowerCase().trim()

    if (status === 'revoked') {
      return { ok: false, error: 'This license has been revoked. Contact your vendor.' }
    }

    if (!stored) {
      // First activation — bind to this machine
      sheet.getRange(sheetRow, COL_MACHINE + 1).setValue(machineId)
      sheet.getRange(sheetRow, COL_DATE    + 1).setValue(new Date().toISOString())
      sheet.getRange(sheetRow, COL_HOST    + 1).setValue(hostname)
      sheet.getRange(sheetRow, COL_STATUS  + 1).setValue('active')
      SpreadsheetApp.flush()
      return { ok: true }
    }

    if (stored === machineId) {
      // Same machine re-activating (reinstall, repair) — allow it
      return { ok: true }
    }

    // Already bound to a different machine
    return {
      ok: false,
      error: 'This license is already activated on another machine. Contact your vendor to transfer it.'
    }
  }

  return { ok: false, error: 'License key not found. Please check the key and try again.' }
}
