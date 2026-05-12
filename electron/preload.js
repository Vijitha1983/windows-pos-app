const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // API proxy — all HTTP goes through main process (no CORS, no SameSite)
  apiRequest: (method, url, body, extraHeaders) =>
    ipcRenderer.invoke('api-request', { method, url, body, extraHeaders }),
  apiClearSession: () => ipcRenderer.invoke('api-clear-session'),

  // electron-store
  storeGet: (key) => ipcRenderer.invoke('store-get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store-set', key, value),
  storeDelete: (key) => ipcRenderer.invoke('store-delete', key),
  storeClear: () => ipcRenderer.invoke('store-clear'),
  storeGetAll: () => ipcRenderer.invoke('store-get-all'),

  // Receipt printing (silent — no dialog)
  printReceipt: (html) => ipcRenderer.invoke('print-receipt', html),
  // Cash drawer kick via ESC/POS to COM/LPT port
  openCashDrawer: (port) => ipcRenderer.invoke('open-cash-drawer', port),

  // License
  licenseCheck:    ()       => ipcRenderer.invoke('license-check'),
  licenseActivate: (serial, email, phone, company) => ipcRenderer.invoke('license-activate', serial, email, phone, company),

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
})
