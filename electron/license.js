const crypto = require('crypto')
const https  = require('https')
const os     = require('os')

const SECRET       = 'ERPNEXT-POS-V2-LK-2026-X4R9M7'
const TRIAL_DAYS   = 30
const CHARSET      = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const SERVER_URL   = 'https://script.google.com/macros/s/AKfycbycoXS_-l5NduU482jerByzseOq0RgNq8REDXknMTvzpk1dJYl9HlwnjD15mIZQSQH63A/exec'
const SERVER_TOKEN = 'ERPNEXT-POS-ACTIVATE-2025'

// ── Serial validation ─────────────────────────────────────────────────────────

function computeChecksum(id15) {
  return crypto.createHmac('sha256', SECRET).update(id15)
    .digest('hex').toUpperCase().slice(0, 5)
}

function validateSerial(raw) {
  if (!raw || typeof raw !== 'string') return false
  const s = raw.toUpperCase().replace(/[\s\-]/g, '')
  if (s.length !== 20) return false
  for (const c of s) { if (!CHARSET.includes(c)) return false }
  return computeChecksum(s.slice(0, 15)) === s.slice(15)
}

// ── Machine fingerprint ───────────────────────────────────────────────────────
// Combines stable hardware identifiers into a single 32-char hash.
// The same physical machine always produces the same ID.

function getMachineId() {
  try {
    const parts = [os.hostname(), os.platform(), os.arch()]
    const cpus = os.cpus()
    if (cpus.length) parts.push(cpus[0].model)
    for (const ifaces of Object.values(os.networkInterfaces())) {
      for (const iface of ifaces) {
        if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
          parts.push(iface.mac)
          break
        }
      }
      if (parts.length > 4) break
    }
    return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32)
  } catch {
    return crypto.createHash('sha256').update(os.hostname()).digest('hex').slice(0, 32)
  }
}

// ── HTTPS GET with redirect following ────────────────────────────────────────
// Google Apps Script redirects once (302) before returning the response.

function httpsGet(url, maxRedirects = 6) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
        headers: { 'User-Agent': 'ERPNextPOS/1.1.0' }, timeout: 15000 },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
          res.resume()
          httpsGet(res.headers.location, maxRedirects - 1).then(resolve).catch(reject)
          return
        }
        let raw = ''
        res.on('data', (c) => { raw += c })
        res.on('end', () => {
          try { resolve(JSON.parse(raw)) }
          catch { reject(new Error('Invalid server response')) }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Connection timeout')) })
    req.end()
  })
}

// ── License check ─────────────────────────────────────────────────────────────

function checkLicense(store) {
  const serial = store.get('licenseSerial')
  if (serial && validateSerial(serial)) {
    // Verify the activation was done on this machine
    const storedMachine  = store.get('licenseMachineId')
    const currentMachine = getMachineId()
    // Require machine binding — no machineId means activation was incomplete
    if (!storedMachine || storedMachine !== currentMachine) {
      return { status: 'expired', daysLeft: 0 }
    }
    return { status: 'active', daysLeft: 0, serial }
  }

  let trialStart = store.get('trialStart')
  if (!trialStart) {
    trialStart = Date.now()
    store.set('trialStart', trialStart)
  }

  const daysUsed = Math.floor((Date.now() - Number(trialStart)) / 86400000)
  const daysLeft = Math.max(0, TRIAL_DAYS - daysUsed)
  return daysLeft > 0
    ? { status: 'trial', daysLeft }
    : { status: 'expired', daysLeft: 0 }
}

// ── License activation ────────────────────────────────────────────────────────

async function activateLicense(store, serial, email, phone, company) {
  if (!validateSerial(serial)) {
    return { ok: false, error: 'Invalid license key. Please check and try again.' }
  }

  const cleaned   = serial.toUpperCase().replace(/[\s\-]/g, '')
  const formatted = `${cleaned.slice(0,5)}-${cleaned.slice(5,10)}-${cleaned.slice(10,15)}-${cleaned.slice(15)}`
  const machineId = getMachineId()

  // ── Online check against activation server (internet required — no offline fallback) ──
  try {
    const params = new URLSearchParams({
      token:     SERVER_TOKEN,
      action:    'activate',
      serial:    formatted,
      machineId: machineId,
      hostname:  os.hostname(),
      email:     (email   || '').trim(),
      phone:     (phone   || '').trim(),
      company:   (company || '').trim(),
    })
    const result = await httpsGet(`${SERVER_URL}?${params.toString()}`)
    if (!result.ok) {
      return { ok: false, error: result.error || 'Activation rejected by server.' }
    }
  } catch (err) {
    return { ok: false, error: 'Cannot reach activation server. An internet connection is required to activate. Please check your connection and try again.' }
  }

  // Store serial + machine fingerprint only after server confirms
  store.set('licenseSerial',    formatted)
  store.set('licenseMachineId', machineId)
  return { ok: true }
}

module.exports = { checkLicense, activateLicense, validateSerial, computeChecksum, CHARSET }
