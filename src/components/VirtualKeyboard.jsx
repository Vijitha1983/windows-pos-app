import { useEffect, useRef, useState } from 'react'
import { usePOSStore } from '../store/posStore'

const QWERTY_ROWS = [
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l'],
  ['SHIFT','z','x','c','v','b','n','m','BACK'],
  ['.','@','SPACE','DONE'],
]

const NUMPAD_ROWS = [
  ['7','8','9'],
  ['4','5','6'],
  ['1','2','3'],
  ['0','.','⌫'],
]

const NUMPAD_ONLY = [
  ['7','8','9'],
  ['4','5','6'],
  ['1','2','3'],
  ['.','0','BACK'],
  ['CLEAR','DONE'],
]

// Function keys with short labels for cashiers
const FKEY_ROW = [
  { key: 'F1',  label: 'New',     title: 'F1 – New Bill' },
  { key: 'F2',  label: 'Sync',    title: 'F2 – Sync / Reload' },
  { key: 'F3',  label: 'Hold',    title: 'F3 – Hold Bill' },
  { key: 'F4',  label: 'New',     title: 'F4 – New Bill' },
  { key: 'F5',  label: 'Summary', title: 'F5 – Sales Summary' },
  { key: 'F6',  label: 'F6',      title: 'F6' },
  { key: 'F7',  label: 'Ret/WS',  title: 'F7 – Toggle Retail / Wholesale' },
  { key: 'F8',  label: 'Cash/Cr', title: 'F8 – Toggle Cash / Credit' },
  { key: 'F9',  label: 'F9',      title: 'F9' },
  { key: 'F10', label: 'F10',     title: 'F10' },
  { key: 'F11', label: 'F11',     title: 'F11' },
  { key: 'F12', label: 'PAY ✓',   title: 'F12 – Payment / Checkout' },
]

function setNativeValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(el, value)
  el.dispatchEvent(new Event('input',  { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function dispatchFKey(key) {
  // Dispatch to window so POSMain / BillTable keyboard handlers catch it
  window.dispatchEvent(new KeyboardEvent('keydown', {
    key,
    code: key,
    bubbles: true,
    cancelable: true,
  }))
}

export default function VirtualKeyboard() {
  const { touchMode } = usePOSStore()
  const [visible, setVisible] = useState(false)
  const [isNum,   setIsNum]   = useState(false)
  const [shifted, setShifted] = useState(false)
  const activeEl = useRef(null)

  useEffect(() => {
    if (!touchMode) { setVisible(false); return }
    function onFocusIn(e) {
      const el = e.target
      if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return
      activeEl.current = el
      setIsNum(el.type === 'number' || el.inputMode === 'numeric')
      setShifted(false)
      setVisible(true)
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [touchMode])

  function sendKey(key) {
    const el = activeEl.current
    if (!el) return
    if (key === 'DONE')  { setVisible(false); el.blur(); return }
    if (key === 'SHIFT') { setShifted(s => !s); return }

    const val = el.value
    const numInput = el.type === 'number'

    if (key === 'CLEAR') { setNativeValue(el, ''); return }

    if (key === 'BACK' || key === '⌫') {
      if (!numInput) {
        const s = el.selectionStart ?? val.length
        const e = el.selectionEnd   ?? val.length
        if (s !== e) {
          setNativeValue(el, val.slice(0, s) + val.slice(e))
          requestAnimationFrame(() => { try { el.setSelectionRange(s, s) } catch {} })
        } else if (s > 0) {
          setNativeValue(el, val.slice(0, s - 1) + val.slice(s))
          requestAnimationFrame(() => { try { el.setSelectionRange(s - 1, s - 1) } catch {} })
        }
      } else {
        setNativeValue(el, val.slice(0, -1))
      }
      return
    }

    const char = key === 'SPACE' ? ' '
      : shifted && key.length === 1 ? key.toUpperCase()
      : key

    if (shifted && key.length === 1) setShifted(false)

    if (!numInput) {
      const s = el.selectionStart ?? val.length
      const e = el.selectionEnd   ?? val.length
      setNativeValue(el, val.slice(0, s) + char + val.slice(e))
      requestAnimationFrame(() => { try { el.setSelectionRange(s + char.length, s + char.length) } catch {} })
    } else {
      if (char === '.' && val.includes('.')) return
      setNativeValue(el, val + char)
    }
  }

  if (!touchMode || !visible) return null

  // ── Number-only input: compact centred numpad ──────────────────
  if (isNum) {
    return (
      <KeyboardShell onHide={() => setVisible(false)}>
        {/* F-key row */}
        <FKeyRow />
        <div className="max-w-[300px] mx-auto py-2 px-3 space-y-1.5">
          {NUMPAD_ONLY.map((row, ri) => (
            <div key={ri} className="flex gap-1.5">
              {row.map((key) => (
                <Key key={key} label={key === 'BACK' ? '⌫' : key === 'DONE' ? '✓ Done' : key}
                  onPress={() => sendKey(key)}
                  variant={key === 'DONE' ? 'done' : key === 'BACK' ? 'back' : key === 'CLEAR' ? 'clear' : 'num'}
                />
              ))}
            </div>
          ))}
          {/* + / - shortcuts */}
          <div className="flex gap-1.5">
            <button
              onPointerDown={(e) => { e.preventDefault(); dispatchFKey('+') }}
              title="+ → Payment / Checkout"
              className="flex-1 py-2.5 rounded-xl bg-green-700 hover:bg-green-600 text-white font-bold text-base transition-colors active:scale-95"
            >
              +
            </button>
            <button
              onPointerDown={(e) => { e.preventDefault(); dispatchFKey('-') }}
              title="− → Recall saved bill"
              className="flex-1 py-2.5 rounded-xl bg-yellow-700 hover:bg-yellow-600 text-white font-bold text-base transition-colors active:scale-95"
            >
              −
            </button>
          </div>
        </div>
      </KeyboardShell>
    )
  }

  // ── Text input: QWERTY left + Numpad right ─────────────────────
  return (
    <KeyboardShell onHide={() => setVisible(false)}>
      {/* F-key row */}
      <FKeyRow />

      <div className="flex gap-2 px-3 py-2">

        {/* ── QWERTY section ── */}
        <div className="flex-1 space-y-1.5">
          {QWERTY_ROWS.map((row, ri) => (
            <div key={ri} className="flex gap-1 justify-start">
              {row.map((key) => {
                const label = key === 'SHIFT' ? '⇧'
                  : key === 'BACK'  ? '⌫'
                  : key === 'SPACE' ? 'Space'
                  : key === 'DONE'  ? '✓ Done'
                  : shifted && key.length === 1 ? key.toUpperCase()
                  : key

                const variant = key === 'DONE'  ? 'done'
                  : key === 'BACK'  ? 'back'
                  : key === 'SHIFT' ? (shifted ? 'shift-on' : 'shift')
                  : key === 'SPACE' ? 'space'
                  : ri === 3        ? 'special'
                  : 'letter'

                return (
                  <Key key={key} label={label} onPress={() => sendKey(key)} variant={variant} />
                )
              })}
            </div>
          ))}
        </div>

        {/* ── Numpad section (right side) ── */}
        <div className="flex flex-col gap-1.5 border-l border-gray-700 pl-2">
          {NUMPAD_ROWS.map((row, ri) => (
            <div key={ri} className="flex gap-1.5">
              {row.map((key) => (
                <Key key={key} label={key} onPress={() => sendKey(key === '⌫' ? 'BACK' : key)}
                  variant={key === '⌫' ? 'back' : 'num'}
                  size="numpad"
                />
              ))}
            </div>
          ))}
          {/* + / - action keys + Clear */}
          <div className="flex gap-1.5">
            <button
              onPointerDown={(e) => { e.preventDefault(); dispatchFKey('+') }}
              title="+ → Payment / Checkout"
              className="flex-1 py-2.5 rounded-xl bg-green-700 hover:bg-green-600 text-white font-bold text-base transition-colors active:scale-95"
            >
              +
            </button>
            <button
              onPointerDown={(e) => { e.preventDefault(); dispatchFKey('-') }}
              title="− → Recall saved bill"
              className="flex-1 py-2.5 rounded-xl bg-yellow-700 hover:bg-yellow-600 text-white font-bold text-base transition-colors active:scale-95"
            >
              −
            </button>
            <button
              onPointerDown={(e) => { e.preventDefault(); sendKey('CLEAR') }}
              className="flex-1 py-2.5 rounded-xl bg-red-900/60 hover:bg-red-800 text-red-300 font-bold text-xs transition-colors active:scale-95"
            >
              Clear
            </button>
          </div>
        </div>

      </div>
    </KeyboardShell>
  )
}

// ── F-key row (dispatches real keyboard events) ─────────────────
function FKeyRow() {
  return (
    <div className="flex gap-1 px-3 pt-2 pb-1 border-b border-gray-700/60 overflow-x-auto">
      {FKEY_ROW.map(({ key, label, title }) => {
        const isAction = ['F2','F3','F5','F7','F8'].includes(key)
        const isPay    = key === 'F12'
        const isNew    = key === 'F1' || key === 'F4'
        const base = 'flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors active:scale-95 select-none'
        const color = isPay    ? 'bg-green-700 hover:bg-green-600 text-white'
                    : isNew    ? 'bg-blue-800 hover:bg-blue-700 text-white'
                    : isAction ? 'bg-purple-800 hover:bg-purple-700 text-purple-100'
                    :            'bg-gray-700 hover:bg-gray-600 text-gray-300'
        return (
          <button
            key={key}
            title={title}
            onPointerDown={(e) => { e.preventDefault(); dispatchFKey(key) }}
            className={`${base} ${color}`}
          >
            <span className="block text-[9px] opacity-60 leading-none mb-0.5">{key}</span>
            <span className="block leading-none">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Shell wrapper ───────────────────────────────────────────────
function KeyboardShell({ children, onHide }) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[200] bg-gray-900 border-t-2 border-purple-700 shadow-2xl select-none"
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.preventDefault()}
    >
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-gray-700">
        <div className="flex items-center gap-1.5 text-purple-400 text-xs">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          On-Screen Keyboard
        </div>
        <button
          onPointerDown={(e) => { e.preventDefault(); onHide() }}
          className="flex items-center gap-1 text-gray-400 hover:text-white text-xs px-3 py-1 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          Hide
        </button>
      </div>
      {children}
    </div>
  )
}

// ── Single key button ───────────────────────────────────────────
function Key({ label, onPress, variant = 'letter', size }) {
  const base = 'transition-colors active:scale-95 font-semibold rounded-xl'

  const styles = {
    letter:   'flex-1 min-w-[30px] py-3 bg-gray-700 hover:bg-blue-600 active:bg-blue-700 text-white text-sm',
    num:      `${size === 'numpad' ? 'w-[58px]' : 'flex-1'} py-3 bg-gray-600 hover:bg-blue-600 active:bg-blue-700 text-white text-lg font-bold`,
    done:     'flex-1 py-3 bg-green-600 hover:bg-green-500 active:bg-green-700 text-white text-sm',
    back:     'py-3 px-3 min-w-[44px] bg-red-800 hover:bg-red-700 active:bg-red-900 text-white text-lg',
    clear:    'flex-1 py-3 bg-red-900/60 hover:bg-red-800 text-red-300 text-xs',
    shift:    'py-3 px-3 min-w-[44px] bg-gray-600 hover:bg-gray-500 text-white text-sm',
    'shift-on':'py-3 px-3 min-w-[44px] bg-blue-600 hover:bg-blue-500 text-white text-sm',
    space:    'flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white text-sm',
    special:  'py-3 px-3 min-w-[36px] bg-gray-600 hover:bg-blue-600 text-white text-sm',
  }

  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onPress() }}
      className={`${base} ${styles[variant] || styles.letter}`}
    >
      {label}
    </button>
  )
}
