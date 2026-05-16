const { app, BrowserWindow, ipcMain, session } = require('electron')
const path = require('path')
const https = require('https')
const http = require('http')
const fs   = require('fs')
const Store = require('electron-store')
const { checkLicense, activateLicense, startTrial } = require('./license')

let mainWin = null   // reference used by cash-drawer IPC

app.disableHardwareAcceleration()

const store = new Store()
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// ─── ERPNext session state (main process owns all HTTP) ──────────────────────
// Keeping cookies here means no CORS / SameSite / browser-security issues at all.
// Cookies are also persisted to electron-store so the session survives app restarts.
let sessionCookies = store.get('_sessionCookies') || {}
let csrfToken      = store.get('_csrfToken')      || 'fetch'

function buildCookieHeader() {
  return Object.entries(sessionCookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

function parseSetCookie(setCookieArray) {
  if (!setCookieArray) return
  let changed = false
  for (const raw of setCookieArray) {
    // Each entry: "name=value; Path=/; HttpOnly; SameSite=Lax"
    const firstPart = raw.split(';')[0].trim()
    const eqIdx = firstPart.indexOf('=')
    if (eqIdx < 0) continue
    const name = firstPart.slice(0, eqIdx).trim()
    const value = firstPart.slice(eqIdx + 1).trim()
    if (name) { sessionCookies[name] = value; changed = true }
  }
  if (changed) store.set('_sessionCookies', sessionCookies)
}

// Low-level HTTP/HTTPS request — no axios, no CORS, full cookie control
function makeRequest({ method, url, body, extraHeaders = {} }) {
  return new Promise((resolve, reject) => {
    let parsedUrl
    try { parsedUrl = new URL(url) } catch (e) { return reject(new Error(`Bad URL: ${url}`)) }

    const isHttps = parsedUrl.protocol === 'https:'
    const transport = isHttps ? https : http

    const bodyStr = body ? JSON.stringify(body) : ''
    const cookieHeader = buildCookieHeader()

    const reqHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Frappe-CSRF-Token': csrfToken,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      ...extraHeaders,
    }

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: method.toUpperCase(),
      headers: reqHeaders,
      // Accept self-signed certs for on-premise ERPNext setups
      rejectUnauthorized: false,
    }

    const req = transport.request(options, (res) => {
      // Capture cookies
      parseSetCookie(res.headers['set-cookie'])

      // Capture CSRF token if ERPNext rotates it
      const newCsrf = res.headers['x-frappe-csrf-token']
      if (newCsrf && newCsrf !== 'fetch') {
        csrfToken = newCsrf
        store.set('_csrfToken', csrfToken)
      }

      let raw = ''
      res.on('data', (chunk) => { raw += chunk })
      res.on('end', () => {
        let data
        try { data = JSON.parse(raw) } catch { data = raw }
        resolve({ status: res.statusCode, data, headers: res.headers })
      })
    })

    req.on('error', reject)
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Request timed out — server is slow, please retry')) })

    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

// ─── IPC: API proxy ───────────────────────────────────────────────────────────
ipcMain.handle('api-request', async (_, { method, url, body, extraHeaders }) => {
  try {
    const result = await makeRequest({ method, url, body, extraHeaders })
    if (result.status >= 400) {
      return { ok: false, status: result.status, data: result.data }
    }
    return { ok: true, status: result.status, data: result.data }
  } catch (err) {
    return { ok: false, status: 0, message: err.message }
  }
})

ipcMain.handle('api-clear-session', () => {
  sessionCookies = {}
  csrfToken = 'fetch'
  store.delete('_sessionCookies')
  store.delete('_csrfToken')
})

// ─── IPC: Receipt printing (silent — no dialog, goes to default printer) ────────
ipcMain.handle('print-receipt', (_, html) => {
  return new Promise((resolve) => {
    const printWin = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })
    printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    printWin.webContents.once('did-finish-load', () => {
      printWin.webContents.print({ silent: true, printBackground: false }, (success, errorType) => {
        printWin.close()
        resolve({ success, errorType })
      })
    })
  })
})

// ─── IPC: Cash drawer kick via COM/LPT port ──────────────────────────────────
// ESC/POS command: ESC p 0 25 250 — works with most receipt-printer-connected drawers.
// port = e.g. "\\\\.\\COM1", "\\\\.\\COM3", "\\\\.\\LPT1"
ipcMain.handle('open-cash-drawer', (_, port) => {
  if (!port) return { skipped: true }
  const cmd = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA])
  return new Promise((resolve) => {
    const stream = fs.createWriteStream(port, { flags: 'w' })
    stream.on('error', (err) => resolve({ success: false, error: err.message }))
    stream.write(cmd, () => { stream.end(); resolve({ success: true }) })
  })
})

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#111827',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
    icon: path.join(__dirname, '../public/icon.ico'),
    show: false,
  })

  mainWin = win
  win.once('ready-to-show', () => win.show())
  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  return win
}

// ── Read pending activation written by the NSIS installer ─────────────────────
// The installer custom page writes pending-activation.txt to userData before
// launching the app. We process it here (trial → apply immediately; activate →
// store data for the renderer to pick up and submit with the real machine ID).
let pendingActivation = null  // { type:'trial' } | { type:'activate', serial, email, phone, company }

async function processPendingActivation() {
  const filePath = path.join(app.getPath('userData'), 'pending-activation.txt')
  if (!fs.existsSync(filePath)) return
  try {
    const raw  = fs.readFileSync(filePath, 'utf8').trim()
    fs.unlinkSync(filePath)
    if (raw === 'trial') {
      startTrial(store)
    } else {
      const [, serial = '', email = '', phone = '', company = ''] = raw.split(/\r?\n/)
      pendingActivation = { type: 'activate', serial: serial.trim(), email: email.trim(), phone: phone.trim(), company: company.trim() }
    }
  } catch { /* ignore — file may be malformed */ }
}

app.whenReady().then(async () => {
  await processPendingActivation()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: License ─────────────────────────────────────────────────────────────
ipcMain.handle('license-check',            ()         => isDev ? { status: 'active', daysLeft: 0 } : checkLicense(store))
ipcMain.handle('license-activate',         (_, serial, email, phone, company) => activateLicense(store, serial, email, phone, company))
ipcMain.handle('license-start-trial',      ()         => startTrial(store))
ipcMain.handle('license-get-pending',      ()         => { const p = pendingActivation; pendingActivation = null; return p })

// ─── IPC: electron-store ──────────────────────────────────────────────────────
ipcMain.handle('store-get', (_, key) => store.get(key))
ipcMain.handle('store-set', (_, key, value) => store.set(key, value))
ipcMain.handle('store-delete', (_, key) => store.delete(key))
ipcMain.handle('store-clear', () => store.clear())
ipcMain.handle('store-get-all', () => store.store)

// ─── IPC: Window controls ─────────────────────────────────────────────────────
ipcMain.on('window-minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
ipcMain.on('window-maximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender)
  w?.isMaximized() ? w.unmaximize() : w?.maximize()
})
ipcMain.on('window-close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
