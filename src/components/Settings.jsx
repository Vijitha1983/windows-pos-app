import { useEffect, useRef, useState } from 'react'
import { usePOSStore } from '../store/posStore'
import { getPOSProfiles, getPOSProfile, getGLAccounts } from '../services/api'
import { cacheClearPersist } from '../services/cache'
import { signOut } from '../services/auth'

// ── Rich text toolbar button ──────────────────────────────────────────────────
function ToolBtn({ children, onMouseDown, title }) {
  return (
    <button type="button" onMouseDown={onMouseDown} title={title}
      className="w-7 h-6 flex items-center justify-center bg-gray-600 hover:bg-gray-500 active:bg-gray-400 text-white text-xs rounded border border-gray-500 flex-shrink-0 cursor-pointer select-none">
      {children}
    </button>
  )
}

// ── Rich text editor (contentEditable + toolbar) ──────────────────────────────
function RichTextEditor({ value, onChange, placeholder, minHeight = '80px' }) {
  const ref = useRef(null)
  const skipSync = useRef(false)
  const imgInputRef = useRef(null)
  const savedRange = useRef(null)
  const [customSize, setCustomSize] = useState('')

  useEffect(() => {
    if (ref.current && !skipSync.current) {
      let html = value || ''
      if (html && !html.includes('<')) html = html.replace(/\n/g, '<br>')
      if (ref.current.innerHTML !== html) ref.current.innerHTML = html
    }
  }, [value])

  const sync = () => {
    skipSync.current = true
    onChange(ref.current?.innerHTML || '')
    setTimeout(() => { skipSync.current = false }, 60)
  }

  // Save selection before toolbar steals focus from the editor
  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel?.rangeCount) savedRange.current = sel.getRangeAt(0).cloneRange()
  }

  // Apply a style span directly on the saved DOM Range — no focus/selection restore needed.
  // Range keeps its DOM node pointers even after visual selection is cleared by focus change.
  const applyStyle = (styleObj) => {
    const range = savedRange.current
    if (!range || range.collapsed) return
    const span = document.createElement('span')
    Object.assign(span.style, styleObj)
    try {
      range.surroundContents(span)
    } catch {
      const frag = range.extractContents()
      span.appendChild(frag)
      range.insertNode(span)
    }
    savedRange.current = null
    ref.current?.focus()
    sync()
  }

  const exec = (cmd, val = null) => {
    ref.current?.focus()
    if (savedRange.current) {
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(savedRange.current)
    }
    document.execCommand(cmd, false, val)
    sync()
  }

  const isEmpty = !value || value.replace(/<[^>]+>/g, '').trim() === ''

  return (
    <>
    <style>{`[contenteditable] img{max-width:100%;border-radius:4px;cursor:pointer}[contenteditable] img:hover{outline:2px solid #ef4444}`}</style>
    <div className="rounded-lg border border-gray-600 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 bg-gray-800 px-1.5 py-1 border-b border-gray-600">
        <ToolBtn onMouseDown={(e) => { e.preventDefault(); exec('bold') }} title="Bold"><b>B</b></ToolBtn>
        <ToolBtn onMouseDown={(e) => { e.preventDefault(); exec('italic') }} title="Italic"><em className="not-italic font-serif italic">I</em></ToolBtn>
        <ToolBtn onMouseDown={(e) => { e.preventDefault(); exec('underline') }} title="Underline"><u>U</u></ToolBtn>
        <div className="w-px h-4 bg-gray-600 mx-0.5 flex-shrink-0" />

        {/* Font size — preset dropdown */}
        <select defaultValue="" title="Preset sizes"
          onMouseDown={(e) => { e.stopPropagation(); saveSelection() }}
          onChange={(e) => { if (e.target.value) { applyStyle({ fontSize: e.target.value }); e.target.value = '' } }}
          className="bg-gray-700 text-white text-xs px-1 py-0 rounded border border-gray-600 h-6 cursor-pointer">
          <option value="" disabled>Size</option>
          {['10px','12px','14px','16px','18px','20px','24px','28px','32px','36px','42px','52px','64px','80px','96px'].map(s => (
            <option key={s} value={s}>{s.replace('px', '')}</option>
          ))}
        </select>

        {/* Custom size — type number, then click ✓ or press Enter */}
        <input
          type="number" min="6" max="300"
          value={customSize}
          placeholder="px"
          title="Type a size, then click ✓ to apply"
          onChange={(e) => setCustomSize(e.target.value)}
          onMouseDown={(e) => { e.stopPropagation(); saveSelection() }}
          onFocus={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter' && customSize) {
              applyStyle({ fontSize: customSize + 'px' })
              setCustomSize('')
              e.preventDefault()
            }
          }}
          onKeyUp={(e) => e.stopPropagation()}
          className="w-10 bg-gray-700 text-white text-xs px-1 py-0 rounded-l border border-dashed border-gray-500 h-6 text-center focus:border-blue-400 focus:outline-none"
        />
        <ToolBtn
          title="Apply custom size"
          onMouseDown={(e) => {
            e.preventDefault()
            if (customSize) {
              applyStyle({ fontSize: customSize + 'px' })
              setCustomSize('')
            }
          }}
        >✓</ToolBtn>

        {/* Font family */}
        <select defaultValue="" title="Font"
          onMouseDown={(e) => { e.stopPropagation(); saveSelection() }}
          onChange={(e) => { if (e.target.value) { applyStyle({ fontFamily: e.target.value }); e.target.value = '' } }}
          className="bg-gray-700 text-white text-xs px-1 py-0 rounded border border-gray-600 h-6 cursor-pointer">
          <option value="" disabled>Font</option>
          <option value="Arial,sans-serif">Arial</option>
          <option value="'Times New Roman',serif">Times</option>
          <option value="'Courier New',monospace">Courier</option>
          <option value="Georgia,serif">Georgia</option>
        </select>

        <div className="w-px h-4 bg-gray-600 mx-0.5 flex-shrink-0" />

        {/* Alignment */}
        <ToolBtn onMouseDown={(e) => { e.preventDefault(); exec('justifyLeft') }} title="Align left">&#8676;</ToolBtn>
        <ToolBtn onMouseDown={(e) => { e.preventDefault(); exec('justifyCenter') }} title="Center">&#8677;</ToolBtn>
        <ToolBtn onMouseDown={(e) => { e.preventDefault(); exec('justifyRight') }} title="Align right">&#8677;</ToolBtn>

        <div className="w-px h-4 bg-gray-600 mx-0.5 flex-shrink-0" />

        {/* Text colours */}
        {['#ffffff','#000000','#e53e3e','#3182ce','#38a169','#dd6b20'].map(c => (
          <button key={c} type="button" title={`Colour ${c}`}
            onMouseDown={(e) => { e.preventDefault(); saveSelection(); exec('foreColor', c) }}
            className="w-5 h-5 rounded-sm border border-gray-500 flex-shrink-0 cursor-pointer"
            style={{ backgroundColor: c }} />
        ))}

        <div className="w-px h-4 bg-gray-600 mx-0.5 flex-shrink-0" />

        {/* Insert image */}
        <input type="file" accept="image/*" ref={imgInputRef} className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]; if (!file) return
            const reader = new FileReader()
            reader.onload = (ev) => {
              ref.current?.focus()
              document.execCommand('insertImage', false, ev.target.result)
              sync()
              e.target.value = ''
            }
            reader.readAsDataURL(file)
          }}
        />
        <ToolBtn onMouseDown={(e) => { e.preventDefault(); imgInputRef.current?.click() }} title="Insert image">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </ToolBtn>
      </div>

      {/* Editable area */}
      <div className="relative">
        {isEmpty && (
          <div className="absolute inset-0 px-3 py-2 text-gray-500 text-xs pointer-events-none whitespace-pre-wrap select-none">
            {placeholder}
          </div>
        )}
        <div ref={ref} contentEditable suppressContentEditableWarning
          onInput={sync}
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
          onKeyPress={(e) => e.stopPropagation()}
          onBlur={saveSelection}
          onClick={(e) => {
            if (e.target.tagName === 'IMG') { e.target.remove(); sync() }
          }}
          style={{ minHeight, padding: '8px 12px', outline: 'none', color: 'white',
            backgroundColor: '#374151', fontSize: '13px', lineHeight: '1.6', wordBreak: 'break-word',
            cursor: 'text' }}
        />
      </div>
    </div>
    </>
  )
}

export default function Settings({ onClose }) {
  const store = usePOSStore()
  const [profiles, setProfiles] = useState([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [saved, setSaved] = useState(false)
  const [urlInput, setUrlInput] = useState(store.erpnextUrl)

  const [giftAccounts,     setGiftAccounts]     = useState([])
  const [loadingGiftAcc,   setLoadingGiftAcc]   = useState(false)
  const [savedGiftAccount, setSavedGiftAccount] = useState('')

  const [licenseSerial, setLicenseSerial] = useState('')
  const [licenseStatus, setLicenseStatus] = useState('')

  const [billHeader,        setBillHeader]        = useState('')
  const [billFooter,        setBillFooter]        = useState('')
  const [billHeaderImage,   setBillHeaderImage]   = useState(null)
  const [billFooterImage,   setBillFooterImage]   = useState(null)
  const [headerImgExpanded, setHeaderImgExpanded] = useState(false)
  const [footerImgExpanded, setFooterImgExpanded] = useState(false)
  const [posImage,          setPosImage]          = useState(null)
  const [receiptPrinter,  setReceiptPrinter]  = useState('')
  const [printers,        setPrinters]        = useState([])

  useEffect(() => {
    window.electronAPI.storeGet('giftAccount').then((v) => setSavedGiftAccount(v || ''))
    window.electronAPI.storeGet('licenseSerial').then((v) => setLicenseSerial(v || ''))
    window.electronAPI.licenseCheck().then((r) => setLicenseStatus(r?.status || ''))
    window.electronAPI.storeGet('billHeader').then((v) => setBillHeader(v || ''))
    window.electronAPI.storeGet('billFooter').then((v) => setBillFooter(v || ''))
    window.electronAPI.storeGet('billHeaderImage').then((v) => setBillHeaderImage(v || null))
    window.electronAPI.storeGet('billFooterImage').then((v) => setBillFooterImage(v || null))
    window.electronAPI.storeGet('posImage').then((v) => setPosImage(v || null))
    window.electronAPI.storeGet('receiptPrinter').then((v) => setReceiptPrinter(v || ''))
    window.electronAPI.getPrinters?.().then((list) => setPrinters(list || [])).catch(() => {})
  }, [])


  async function loadGiftAccounts() {
    setLoadingGiftAcc(true)
    try {
      const list = await getGLAccounts(null, store.posProfileData?.company)
      setGiftAccounts(list)
    } catch {}
    setLoadingGiftAcc(false)
  }

  async function selectGiftAccount(name) {
    await window.electronAPI.storeSet('giftAccount', name)
    setSavedGiftAccount(name)
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

  async function handleClearCache() {
    await cacheClearPersist()
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onKeyDown={(e) => e.stopPropagation()} onKeyUp={(e) => e.stopPropagation()}>
      <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-700 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-white font-bold text-lg">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Bill Receipt Header / Footer */}
          <section>
            <h3 className="text-gray-300 font-medium mb-3 text-sm uppercase tracking-wide">Bill Receipt</h3>
            <div className="space-y-4">

              {/* ── Header ─── */}
              <div className="bg-gray-700/30 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-gray-300 text-xs font-semibold uppercase tracking-wide">Header</p>
                  {billHeader && (
                    <button
                      type="button"
                      onClick={async () => { setBillHeader(''); await window.electronAPI.storeSet('billHeader', '') }}
                      className="text-red-400 hover:text-red-300 text-xs transition-colors"
                    >Clear text</button>
                  )}
                </div>

                {/* Header image upload */}
                <div className="flex items-start gap-3">
                  {billHeaderImage ? (
                    <div className={`relative ${headerImgExpanded ? 'w-full' : 'flex-shrink-0'}`}>
                      <img
                        src={billHeaderImage} alt="Header"
                        title={headerImgExpanded ? 'Click to collapse' : 'Click to expand'}
                        onClick={() => setHeaderImgExpanded((v) => !v)}
                        className={`rounded object-contain bg-gray-700/60 p-1 cursor-pointer transition-all ${headerImgExpanded ? 'w-full max-h-48' : 'h-16'}`}
                      />
                      <button
                        onClick={async () => { setBillHeaderImage(null); setHeaderImgExpanded(false); await window.electronAPI.storeSet('billHeaderImage', null) }}
                        className="absolute -top-1 -right-1 bg-red-800 hover:bg-red-700 text-white text-xs w-4 h-4 flex items-center justify-center rounded-full leading-none"
                      >×</button>
                    </div>
                  ) : null}
                  <div className="flex-1">
                    <input type="file" accept="image/*" id="billHeaderImageInput" className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]; if (!file) return
                        const reader = new FileReader()
                        reader.onload = async (ev) => {
                          setBillHeaderImage(ev.target.result)
                          await window.electronAPI.storeSet('billHeaderImage', ev.target.result)
                          setSaved(true); setTimeout(() => setSaved(false), 1500)
                          e.target.value = ''
                        }
                        reader.readAsDataURL(file)
                      }}
                    />
                    <label htmlFor="billHeaderImageInput" className="cursor-pointer inline-block bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors">
                      {billHeaderImage ? 'Change Image' : 'Upload Image'}
                    </label>
                    <p className="text-gray-600 text-[10px] mt-1">Printed above the header text</p>
                  </div>
                </div>

                {/* Header text */}
                <p className="text-gray-500 text-[10px]">Select text then use the toolbar to set size, font, bold, colour etc.</p>
                <RichTextEditor
                  value={billHeader}
                  onChange={setBillHeader}
                  placeholder={"Hettiarachchi & Sons International\nNo.30, Kadawatha Road, Kadawatha\n011-2345678 / 077-1234567"}
                  minHeight="90px"
                />
              </div>

              {/* ── Footer ─── */}
              <div className="bg-gray-700/30 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-gray-300 text-xs font-semibold uppercase tracking-wide">Footer</p>
                  {billFooter && (
                    <button
                      type="button"
                      onClick={async () => { setBillFooter(''); await window.electronAPI.storeSet('billFooter', '') }}
                      className="text-red-400 hover:text-red-300 text-xs transition-colors"
                    >Clear text</button>
                  )}
                </div>

                {/* Footer image upload */}
                <div className="flex items-start gap-3">
                  {billFooterImage ? (
                    <div className={`relative ${footerImgExpanded ? 'w-full' : 'flex-shrink-0'}`}>
                      <img
                        src={billFooterImage} alt="Footer"
                        title={footerImgExpanded ? 'Click to collapse' : 'Click to expand'}
                        onClick={() => setFooterImgExpanded((v) => !v)}
                        className={`rounded object-contain bg-gray-700/60 p-1 cursor-pointer transition-all ${footerImgExpanded ? 'w-full max-h-48' : 'h-16'}`}
                      />
                      <button
                        onClick={async () => { setBillFooterImage(null); setFooterImgExpanded(false); await window.electronAPI.storeSet('billFooterImage', null) }}
                        className="absolute -top-1 -right-1 bg-red-800 hover:bg-red-700 text-white text-xs w-4 h-4 flex items-center justify-center rounded-full leading-none"
                      >×</button>
                    </div>
                  ) : null}
                  <div className="flex-1">
                    <input type="file" accept="image/*" id="billFooterImageInput" className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]; if (!file) return
                        const reader = new FileReader()
                        reader.onload = async (ev) => {
                          setBillFooterImage(ev.target.result)
                          await window.electronAPI.storeSet('billFooterImage', ev.target.result)
                          setSaved(true); setTimeout(() => setSaved(false), 1500)
                          e.target.value = ''
                        }
                        reader.readAsDataURL(file)
                      }}
                    />
                    <label htmlFor="billFooterImageInput" className="cursor-pointer inline-block bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors">
                      {billFooterImage ? 'Change Image' : 'Upload Image'}
                    </label>
                    <p className="text-gray-600 text-[10px] mt-1">Printed below the footer text</p>
                  </div>
                </div>

                {/* Footer text */}
                <p className="text-gray-500 text-[10px]">Select text then use the toolbar to set size, font, bold, colour etc.</p>
                <RichTextEditor
                  value={billFooter}
                  onChange={setBillFooter}
                  placeholder={"Thank you! Come again.\nExchange within 7 days with receipt."}
                  minHeight="70px"
                />
              </div>

              {/* Save text fields */}
              <button
                onClick={async () => {
                  await Promise.all([
                    window.electronAPI.storeSet('billHeader', billHeader),
                    window.electronAPI.storeSet('billFooter', billFooter),
                    window.electronAPI.storeSet('billHeaderImage', billHeaderImage),
                    window.electronAPI.storeSet('billFooterImage', billFooterImage),
                  ])
                  setSaved(true); setTimeout(() => setSaved(false), 1500)
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
              >
                Save Header &amp; Footer
              </button>

              {/* ── POS Display Image ─── */}
              <div className="bg-gray-700/30 rounded-xl p-3 space-y-2 border-t border-gray-700/60 pt-3">
                <p className="text-gray-300 text-xs font-semibold uppercase tracking-wide">POS Display Image</p>
                <p className="text-gray-600 text-[10px]">Shown in the bill panel when the item grid is hidden</p>
                <div className="flex items-start gap-3">
                  {posImage ? (
                    <div className="relative flex-shrink-0">
                      <img src={posImage} alt="POS" className="h-16 rounded object-contain bg-gray-700/60 p-1" />
                      <button
                        onClick={async () => { setPosImage(null); await window.electronAPI.storeSet('posImage', null); setSaved(true); setTimeout(() => setSaved(false), 1500) }}
                        className="absolute -top-1 -right-1 bg-red-800 hover:bg-red-700 text-white text-xs w-4 h-4 flex items-center justify-center rounded-full leading-none"
                      >×</button>
                    </div>
                  ) : null}
                  <div>
                    <input type="file" accept="image/*" id="posImageInput" className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]; if (!file) return
                        const reader = new FileReader()
                        reader.onload = async (ev) => {
                          setPosImage(ev.target.result)
                          await window.electronAPI.storeSet('posImage', ev.target.result)
                          setSaved(true); setTimeout(() => setSaved(false), 1500)
                          e.target.value = ''
                        }
                        reader.readAsDataURL(file)
                      }}
                    />
                    <label htmlFor="posImageInput" className="cursor-pointer inline-block bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors">
                      {posImage ? 'Change Image' : 'Upload Image'}
                    </label>
                  </div>
                </div>
              </div>

              {/* ── Receipt Printer ─── */}
              <div className="bg-gray-700/30 rounded-xl p-3 space-y-2 border-t border-gray-700/60 pt-3">
                <p className="text-gray-300 text-xs font-semibold uppercase tracking-wide">Receipt Printer</p>
                <p className="text-gray-600 text-[10px]">Select the thermal printer for receipts (leave blank for Windows default)</p>
                <div className="flex gap-2 items-center">
                  <select
                    value={receiptPrinter}
                    onChange={(e) => setReceiptPrinter(e.target.value)}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="">— Windows Default Printer —</option>
                    {printers.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}{p.isDefault ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={async () => {
                      await window.electronAPI.storeSet('receiptPrinter', receiptPrinter)
                      setSaved(true); setTimeout(() => setSaved(false), 1500)
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs transition-colors whitespace-nowrap"
                  >
                    Save
                  </button>
                </div>
              </div>

            </div>
          </section>

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

              {/* Gift Card GL Account */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-gray-400 text-sm">Gift Card — GL Account</h4>
                  <button
                    onClick={loadGiftAccounts}
                    disabled={loadingGiftAcc}
                    className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                  >
                    {loadingGiftAcc ? 'Loading…' : 'Load accounts'}
                  </button>
                </div>
                <div className="bg-gray-700/50 rounded-lg px-4 py-2 text-sm text-white mb-2">
                  Current: <span className="text-blue-400">{savedGiftAccount || <span className="text-gray-500">Not set</span>}</span>
                </div>
                {giftAccounts.length > 0 && (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {giftAccounts.map((a) => (
                      <button
                        key={a.name}
                        onClick={() => selectGiftAccount(a.name)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          savedGiftAccount === a.name
                            ? 'bg-blue-700 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                )}
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

          {/* License */}
          <section>
            <h3 className="text-gray-300 font-medium mb-2 text-sm uppercase tracking-wide">License</h3>
            <div className="bg-gray-700/50 rounded-lg px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Status</span>
                {licenseStatus === 'active' && (
                  <span className="text-green-400 text-sm font-medium">Active</span>
                )}
                {licenseStatus === 'trial' && (
                  <span className="text-amber-400 text-sm font-medium">Trial</span>
                )}
                {licenseStatus === 'expired' && (
                  <span className="text-red-400 text-sm font-medium">Expired</span>
                )}
                {!licenseStatus && (
                  <span className="text-gray-500 text-sm">—</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-400 text-sm flex-shrink-0">Serial Key</span>
                <span className="text-white text-sm font-mono truncate">
                  {licenseSerial || <span className="text-gray-500">Not activated</span>}
                </span>
              </div>
            </div>
          </section>

          {/* Cache */}
          <section>
            <h3 className="text-gray-300 font-medium mb-3 text-sm uppercase tracking-wide">Cache</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-gray-700/40 rounded-lg px-4 py-3">
                <div>
                  <p className="text-gray-300 text-sm font-medium">Clear All Cache</p>
                  <p className="text-gray-500 text-xs mt-0.5">Items, prices, categories, tax templates</p>
                </div>
                <button
                  onClick={handleClearCache}
                  className="bg-gray-600 hover:bg-gray-500 text-gray-200 text-sm px-4 py-1.5 rounded-lg transition-colors flex-shrink-0"
                >
                  Clear
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 flex items-center justify-between gap-4">
          <div className="flex flex-col">
            {saved && <span className="text-green-400 text-sm">Saved ✓</span>}
            <span className="text-gray-600 text-xs select-none">
              Orbis POS v1.4.0 &nbsp;·&nbsp; &copy; {new Date().getFullYear()} Vijitha Rajapaksha. All rights reserved.
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
