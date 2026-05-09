const crypto = require('crypto')

// WARNING: If you publish this source, move SECRET to a separate file
// that is listed in .gitignore so it cannot be used to forge keys.
const SECRET = 'HSP-ERPNEXT-POS-LK-2025-X9K7'
const TRIAL_DAYS = 30

// Valid charset (no 0, O, I, 1 to avoid confusion when reading/typing)
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function computeChecksum(id15) {
  return crypto
    .createHmac('sha256', SECRET)
    .update(id15)
    .digest('hex')
    .toUpperCase()
    .slice(0, 5)
}

// Accepts any formatting (spaces, dashes, lowercase)
function validateSerial(raw) {
  if (!raw || typeof raw !== 'string') return false
  const s = raw.toUpperCase().replace(/[\s\-]/g, '')
  if (s.length !== 20) return false
  for (const c of s) {
    if (!CHARSET.includes(c)) return false
  }
  const id = s.slice(0, 15)
  const provided = s.slice(15)
  return computeChecksum(id) === provided
}

function checkLicense(store) {
  const serial = store.get('licenseSerial')
  if (serial && validateSerial(serial)) {
    return { status: 'active', daysLeft: 0, serial }
  }

  let trialStart = store.get('trialStart')
  if (!trialStart) {
    trialStart = Date.now()
    store.set('trialStart', trialStart)
  }

  const elapsed  = Date.now() - Number(trialStart)
  const daysUsed = Math.floor(elapsed / (1000 * 60 * 60 * 24))
  const daysLeft = Math.max(0, TRIAL_DAYS - daysUsed)

  return daysLeft > 0
    ? { status: 'trial', daysLeft }
    : { status: 'expired', daysLeft: 0 }
}

function activateLicense(store, serial) {
  if (!validateSerial(serial)) {
    return { ok: false, error: 'Invalid license key. Please check and try again.' }
  }
  const cleaned = serial.toUpperCase().replace(/[\s\-]/g, '')
  const formatted = `${cleaned.slice(0,5)}-${cleaned.slice(5,10)}-${cleaned.slice(10,15)}-${cleaned.slice(15)}`
  store.set('licenseSerial', formatted)
  return { ok: true }
}

module.exports = { checkLicense, activateLicense, validateSerial, computeChecksum, CHARSET }
