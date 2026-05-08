import { useEffect, useState } from 'react'
import { usePOSStore } from '../store/posStore'
import { getPOSProfiles, getPOSProfile, getGLAccounts } from '../services/api'
import { cacheClear } from '../services/cache'
import { signOut } from '../services/auth'

export default function Settings({ onClose }) {
  const store = usePOSStore()
  const [profiles, setProfiles] = useState([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [saved, setSaved] = useState(false)
  const [urlInput, setUrlInput] = useState(store.erpnextUrl)

  // GL account selectors
  const [cashAccounts,       setCashAccounts]       = useState([])
  const [bankAccounts,       setBankAccounts]       = useState([])
  const [kokoAccounts,       setKokoAccounts]       = useState([])
  const [loadingCash,        setLoadingCash]        = useState(false)
  const [loadingBank,        setLoadingBank]        = useState(false)
  const [loadingKoko,        setLoadingKoko]        = useState(false)
  const [savedCashAccount,   setSavedCashAccount]   = useState('')
  const [savedBankAccount,   setSavedBankAccount]   = useState('')
  const [savedKokoAccount,   setSavedKokoAccount]   = useState('')

  useEffect(() => {
    window.electronAPI.storeGet('cashAccount').then((v) => setSavedCashAccount(v || ''))
    window.electronAPI.storeGet('bankAccount').then((v) => setSavedBankAccount(v || ''))
    window.electronAPI.storeGet('kokoAccount').then((v) => setSavedKokoAccount(v || ''))
  }, [])

  async function loadCashAccounts() {
    setLoadingCash(true)
    try {
      const list = await getGLAccounts('Cash', store.posProfileData?.company)
      setCashAccounts(list)
    } catch {}
    setLoadingCash(false)
  }

  async function loadBankAccounts() {
    setLoadingBank(true)
    try {
      const list = await getGLAccounts('Bank', store.posProfileData?.company)
      setBankAccounts(list)
    } catch {}
    setLoadingBank(false)
  }

  async function loadKokoAccounts() {
    setLoadingKoko(true)
    try {
      const list = await getGLAccounts('Bank', store.posProfileData?.company)
      setKokoAccounts(list)
    } catch {}
    setLoadingKoko(false)
  }

  async function selectKokoAccount(name) {
    await window.electronAPI.storeSet('kokoAccount', name)
    setSavedKokoAccount(name)
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  async function selectCashAccount(name) {
    await window.electronAPI.storeSet('cashAccount', name)
    setSavedCashAccount(name)
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  async function selectBankAccount(name) {
    await window.electronAPI.storeSet('bankAccount', name)
    setSavedBankAccount(name)
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  async function loadProfiles() {
    setLoadingProfiles(true)
    try {
      const list = await getPOSProfiles()
      setProfiles(list)
    } catch {}
    setLoadingProfiles(false)
  }

  async function selectProfile(name) {
    try {
      const data = await getPOSProfile(name)
      store.setPosProfile(name)
      store.setPosProfileData(data)
      await window.electronAPI.storeSet('posProfile', name)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error(err)
    }
  }

  function handleClearCache() {
    cacheClear()
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  async function handleLogout() {
    await signOut()
    store.setLoggedIn(false)
    store.setCurrentScreen('login')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-700 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-white font-bold text-lg">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* ERPNext URL */}
          <section>
            <h3 className="text-gray-300 font-medium mb-2 text-sm uppercase tracking-wide">Connection</h3>
            <div className="space-y-2">
              <label className="block text-sm text-gray-400">ERPNext URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={async () => {
                    await window.electronAPI.storeSet('erpnextUrl', urlInput)
                    store.setErpnextUrl(urlInput)
                    setSaved(true)
                    setTimeout(() => setSaved(false), 1500)
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </section>

          {/* POS Profile */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-gray-300 font-medium text-sm uppercase tracking-wide">POS Profile</h3>
              <button
                onClick={loadProfiles}
                disabled={loadingProfiles}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {loadingProfiles ? 'Loading…' : 'Load profiles'}
              </button>
            </div>
            <div className="bg-gray-700/50 rounded-lg px-4 py-2 text-sm text-white mb-2">
              Current: <span className="text-blue-400">{store.posProfile || 'None'}</span>
            </div>
            {profiles.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {profiles.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => selectProfile(p.name)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      store.posProfile === p.name
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Display */}
          <section>
            <h3 className="text-gray-300 font-medium mb-3 text-sm uppercase tracking-wide">Display</h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-gray-300 text-sm">Show Item Images</span>
                <Toggle
                  value={store.showImages}
                  onChange={(v) => {
                    store.setShowImages(v)
                    window.electronAPI.storeSet('showImages', v)
                  }}
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-gray-300 text-sm">Dark Theme</span>
                <Toggle
                  value={store.theme === 'dark'}
                  onChange={(v) => store.setTheme(v ? 'dark' : 'light')}
                />
              </label>
            </div>
          </section>

          {/* Payment Methods */}
          <section>
            <h3 className="text-gray-300 font-medium mb-2 text-sm uppercase tracking-wide">Payment Methods</h3>
            <div className="space-y-4">

              {/* Cash GL Account */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-gray-400 text-sm">Cash — GL Account</h4>
                  <button
                    onClick={loadCashAccounts}
                    disabled={loadingCash}
                    className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                  >
                    {loadingCash ? 'Loading…' : 'Load accounts'}
                  </button>
                </div>
                <div className="bg-gray-700/50 rounded-lg px-4 py-2 text-sm text-white mb-2">
                  Current: <span className="text-green-400">{savedCashAccount || <span className="text-gray-500">Not set</span>}</span>
                </div>
                {cashAccounts.length > 0 && (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {cashAccounts.map((a) => (
                      <button
                        key={a.name}
                        onClick={() => selectCashAccount(a.name)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          savedCashAccount === a.name
                            ? 'bg-green-700 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Bank / Card GL Account */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-gray-400 text-sm">Bank / Credit Card — GL Account</h4>
                  <button
                    onClick={loadBankAccounts}
                    disabled={loadingBank}
                    className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                  >
                    {loadingBank ? 'Loading…' : 'Load accounts'}
                  </button>
                </div>
                <div className="bg-gray-700/50 rounded-lg px-4 py-2 text-sm text-white mb-2">
                  Current: <span className="text-green-400">{savedBankAccount || <span className="text-gray-500">Not set</span>}</span>
                </div>
                {bankAccounts.length > 0 && (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {bankAccounts.map((a) => (
                      <button
                        key={a.name}
                        onClick={() => selectBankAccount(a.name)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          savedBankAccount === a.name
                            ? 'bg-green-700 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Koko Pay GL Account */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-gray-400 text-sm">Koko Pay — GL Account</h4>
                  <button
                    onClick={loadKokoAccounts}
                    disabled={loadingKoko}
                    className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                  >
                    {loadingKoko ? 'Loading…' : 'Load accounts'}
                  </button>
                </div>
                <div className="bg-gray-700/50 rounded-lg px-4 py-2 text-sm text-white mb-2">
                  Current: <span className="text-orange-400">{savedKokoAccount || <span className="text-gray-500">Not set</span>}</span>
                </div>
                {kokoAccounts.length > 0 && (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {kokoAccounts.map((a) => (
                      <button
                        key={a.name}
                        onClick={() => selectKokoAccount(a.name)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          savedKokoAccount === a.name
                            ? 'bg-orange-700 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Koko Pay mode name */}
              <div className="space-y-1">
                <label className="block text-sm text-gray-400">Koko Pay — ERPNext Mode of Payment Name</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Bank Transfer"
                    defaultValue=""
                    id="kokoModeNameInput"
                    onFocus={async (e) => {
                      if (!e.target.value) {
                        const v = await window.electronAPI.storeGet('kokoModeName')
                        e.target.value = v || ''
                      }
                    }}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  />
                  <button
                    onClick={async () => {
                      const val = document.getElementById('kokoModeNameInput').value.trim()
                      await window.electronAPI.storeSet('kokoModeName', val)
                      setSaved(true); setTimeout(() => setSaved(false), 1500)
                    }}
                    className="bg-orange-700 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                  >Save</button>
                </div>
                <p className="text-gray-600 text-xs">Must match exactly the Mode of Payment name in ERPNext. e.g. <span className="font-mono text-gray-500">Bank Transfer</span></p>
              </div>

              {/* Gift Card mode name */}
              <div className="space-y-1">
                <label className="block text-sm text-gray-400">Gift Card — Mode of Payment Name</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Gift Card"
                    defaultValue=""
                    id="giftModeNameInput"
                    onFocus={async (e) => {
                      if (!e.target.value) {
                        const v = await window.electronAPI.storeGet('giftModeName')
                        e.target.value = v || 'Gift Card'
                      }
                    }}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={async () => {
                      const val = document.getElementById('giftModeNameInput').value.trim() || 'Gift Card'
                      await window.electronAPI.storeSet('giftModeName', val)
                      setSaved(true); setTimeout(() => setSaved(false), 1500)
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                  >Save</button>
                </div>
                <p className="text-gray-600 text-xs">Must match exactly the name in ERPNext <span className="font-mono">Accounts → Mode of Payment</span>.</p>
              </div>

              {/* Gift Card account short name */}
              <div className="space-y-1">
                <label className="block text-sm text-gray-400">Gift Card — Account Name <span className="text-gray-600">(no number prefix)</span></label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Gift Card"
                    defaultValue=""
                    id="giftAccountShortInput"
                    onFocus={async (e) => {
                      if (!e.target.value) {
                        const v = await window.electronAPI.storeGet('giftAccountShort')
                        e.target.value = v || ''
                      }
                    }}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={async () => {
                      const val = document.getElementById('giftAccountShortInput').value.trim()
                      await window.electronAPI.storeSet('giftAccountShort', val)
                      setSaved(true); setTimeout(() => setSaved(false), 1500)
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                  >Save</button>
                </div>
                <p className="text-gray-600 text-xs">
                  Just the account name — no number, no company suffix.<br/>
                  e.g. your account is <span className="font-mono text-gray-500">200417 - Gift Card - IT</span>, enter <span className="font-mono text-gray-500">Gift Card</span>.<br/>
                  Works even when the account number changes.
                </p>
              </div>
            </div>
          </section>

          {/* Hardware */}
          <section>
            <h3 className="text-gray-300 font-medium mb-2 text-sm uppercase tracking-wide">Hardware</h3>
            <div className="space-y-2">
              <label className="block text-sm text-gray-400">Cash Drawer Port</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="\\.\\COM1 or leave blank"
                  defaultValue=""
                  id="drawerPortInput"
                  onFocus={async (e) => {
                    if (!e.target.value) {
                      const stored = await window.electronAPI.storeGet('drawerPort')
                      if (stored) e.target.value = stored
                    }
                  }}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 font-mono"
                />
                <button
                  onClick={async () => {
                    const val = document.getElementById('drawerPortInput').value.trim()
                    await window.electronAPI.storeSet('drawerPort', val)
                    setSaved(true)
                    setTimeout(() => setSaved(false), 1500)
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  Save
                </button>
              </div>
              <p className="text-gray-600 text-xs">e.g. <span className="font-mono">\\.\\COM3</span> or <span className="font-mono">\\.\\LPT1</span>. Leave blank to skip.</p>
            </div>
          </section>

          {/* Cache */}
          <section>
            <h3 className="text-gray-300 font-medium mb-2 text-sm uppercase tracking-wide">Cache</h3>
            <button
              onClick={handleClearCache}
              className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm px-4 py-2 rounded-lg transition-colors"
            >
              Clear Item Cache
            </button>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 flex items-center justify-between gap-4">
          <div className="flex flex-col">
            {saved && <span className="text-green-400 text-sm">Saved ✓</span>}
            <span className="text-gray-600 text-xs select-none">
              ERPNext POS v1.0.0 &nbsp;·&nbsp; &copy; 2025 Vijitha Rajapaksha. All rights reserved.
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="bg-red-800 hover:bg-red-700 text-red-200 text-sm px-4 py-2 rounded-lg transition-colors flex-shrink-0"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        value ? 'bg-blue-600' : 'bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          value ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}
