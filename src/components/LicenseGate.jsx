import { useEffect, useState, useRef } from 'react'

// Country codes list — name, dial code, 2-letter ISO for display
const COUNTRIES = [
  { name: 'Afghanistan',           code: 'AF', dial: '+93'   },
  { name: 'Albania',               code: 'AL', dial: '+355'  },
  { name: 'Algeria',               code: 'DZ', dial: '+213'  },
  { name: 'Argentina',             code: 'AR', dial: '+54'   },
  { name: 'Armenia',               code: 'AM', dial: '+374'  },
  { name: 'Australia',             code: 'AU', dial: '+61'   },
  { name: 'Austria',               code: 'AT', dial: '+43'   },
  { name: 'Azerbaijan',            code: 'AZ', dial: '+994'  },
  { name: 'Bahrain',               code: 'BH', dial: '+973'  },
  { name: 'Bangladesh',            code: 'BD', dial: '+880'  },
  { name: 'Belarus',               code: 'BY', dial: '+375'  },
  { name: 'Belgium',               code: 'BE', dial: '+32'   },
  { name: 'Bolivia',               code: 'BO', dial: '+591'  },
  { name: 'Bosnia & Herzegovina',  code: 'BA', dial: '+387'  },
  { name: 'Brazil',                code: 'BR', dial: '+55'   },
  { name: 'Bulgaria',              code: 'BG', dial: '+359'  },
  { name: 'Cambodia',              code: 'KH', dial: '+855'  },
  { name: 'Cameroon',              code: 'CM', dial: '+237'  },
  { name: 'Canada',                code: 'CA', dial: '+1'    },
  { name: 'Chile',                 code: 'CL', dial: '+56'   },
  { name: 'China',                 code: 'CN', dial: '+86'   },
  { name: 'Colombia',              code: 'CO', dial: '+57'   },
  { name: 'Croatia',               code: 'HR', dial: '+385'  },
  { name: 'Cuba',                  code: 'CU', dial: '+53'   },
  { name: 'Cyprus',                code: 'CY', dial: '+357'  },
  { name: 'Czech Republic',        code: 'CZ', dial: '+420'  },
  { name: 'Denmark',               code: 'DK', dial: '+45'   },
  { name: 'Ecuador',               code: 'EC', dial: '+593'  },
  { name: 'Egypt',                 code: 'EG', dial: '+20'   },
  { name: 'Ethiopia',              code: 'ET', dial: '+251'  },
  { name: 'Finland',               code: 'FI', dial: '+358'  },
  { name: 'France',                code: 'FR', dial: '+33'   },
  { name: 'Georgia',               code: 'GE', dial: '+995'  },
  { name: 'Germany',               code: 'DE', dial: '+49'   },
  { name: 'Ghana',                 code: 'GH', dial: '+233'  },
  { name: 'Greece',                code: 'GR', dial: '+30'   },
  { name: 'Hong Kong',             code: 'HK', dial: '+852'  },
  { name: 'Hungary',               code: 'HU', dial: '+36'   },
  { name: 'India',                 code: 'IN', dial: '+91'   },
  { name: 'Indonesia',             code: 'ID', dial: '+62'   },
  { name: 'Iran',                  code: 'IR', dial: '+98'   },
  { name: 'Iraq',                  code: 'IQ', dial: '+964'  },
  { name: 'Ireland',               code: 'IE', dial: '+353'  },
  { name: 'Israel',                code: 'IL', dial: '+972'  },
  { name: 'Italy',                 code: 'IT', dial: '+39'   },
  { name: 'Japan',                 code: 'JP', dial: '+81'   },
  { name: 'Jordan',                code: 'JO', dial: '+962'  },
  { name: 'Kazakhstan',            code: 'KZ', dial: '+7'    },
  { name: 'Kenya',                 code: 'KE', dial: '+254'  },
  { name: 'Kuwait',                code: 'KW', dial: '+965'  },
  { name: 'Kyrgyzstan',            code: 'KG', dial: '+996'  },
  { name: 'Laos',                  code: 'LA', dial: '+856'  },
  { name: 'Latvia',                code: 'LV', dial: '+371'  },
  { name: 'Lebanon',               code: 'LB', dial: '+961'  },
  { name: 'Libya',                 code: 'LY', dial: '+218'  },
  { name: 'Lithuania',             code: 'LT', dial: '+370'  },
  { name: 'Luxembourg',            code: 'LU', dial: '+352'  },
  { name: 'Malaysia',              code: 'MY', dial: '+60'   },
  { name: 'Maldives',              code: 'MV', dial: '+960'  },
  { name: 'Mexico',                code: 'MX', dial: '+52'   },
  { name: 'Moldova',               code: 'MD', dial: '+373'  },
  { name: 'Mongolia',              code: 'MN', dial: '+976'  },
  { name: 'Morocco',               code: 'MA', dial: '+212'  },
  { name: 'Myanmar',               code: 'MM', dial: '+95'   },
  { name: 'Nepal',                 code: 'NP', dial: '+977'  },
  { name: 'Netherlands',           code: 'NL', dial: '+31'   },
  { name: 'New Zealand',           code: 'NZ', dial: '+64'   },
  { name: 'Nigeria',               code: 'NG', dial: '+234'  },
  { name: 'Norway',                code: 'NO', dial: '+47'   },
  { name: 'Oman',                  code: 'OM', dial: '+968'  },
  { name: 'Pakistan',              code: 'PK', dial: '+92'   },
  { name: 'Palestine',             code: 'PS', dial: '+970'  },
  { name: 'Panama',                code: 'PA', dial: '+507'  },
  { name: 'Peru',                  code: 'PE', dial: '+51'   },
  { name: 'Philippines',           code: 'PH', dial: '+63'   },
  { name: 'Poland',                code: 'PL', dial: '+48'   },
  { name: 'Portugal',              code: 'PT', dial: '+351'  },
  { name: 'Qatar',                 code: 'QA', dial: '+974'  },
  { name: 'Romania',               code: 'RO', dial: '+40'   },
  { name: 'Russia',                code: 'RU', dial: '+7'    },
  { name: 'Saudi Arabia',          code: 'SA', dial: '+966'  },
  { name: 'Senegal',               code: 'SN', dial: '+221'  },
  { name: 'Serbia',                code: 'RS', dial: '+381'  },
  { name: 'Singapore',             code: 'SG', dial: '+65'   },
  { name: 'Slovakia',              code: 'SK', dial: '+421'  },
  { name: 'Slovenia',              code: 'SI', dial: '+386'  },
  { name: 'South Africa',          code: 'ZA', dial: '+27'   },
  { name: 'South Korea',           code: 'KR', dial: '+82'   },
  { name: 'Spain',                 code: 'ES', dial: '+34'   },
  { name: 'Sri Lanka',             code: 'LK', dial: '+94'   },
  { name: 'Sudan',                 code: 'SD', dial: '+249'  },
  { name: 'Sweden',                code: 'SE', dial: '+46'   },
  { name: 'Switzerland',           code: 'CH', dial: '+41'   },
  { name: 'Syria',                 code: 'SY', dial: '+963'  },
  { name: 'Taiwan',                code: 'TW', dial: '+886'  },
  { name: 'Tajikistan',            code: 'TJ', dial: '+992'  },
  { name: 'Tanzania',              code: 'TZ', dial: '+255'  },
  { name: 'Thailand',              code: 'TH', dial: '+66'   },
  { name: 'Tunisia',               code: 'TN', dial: '+216'  },
  { name: 'Turkey',                code: 'TR', dial: '+90'   },
  { name: 'Turkmenistan',          code: 'TM', dial: '+993'  },
  { name: 'Uganda',                code: 'UG', dial: '+256'  },
  { name: 'Ukraine',               code: 'UA', dial: '+380'  },
  { name: 'United Arab Emirates',  code: 'AE', dial: '+971'  },
  { name: 'United Kingdom',        code: 'GB', dial: '+44'   },
  { name: 'United States',         code: 'US', dial: '+1'    },
  { name: 'Uruguay',               code: 'UY', dial: '+598'  },
  { name: 'Uzbekistan',            code: 'UZ', dial: '+998'  },
  { name: 'Venezuela',             code: 'VE', dial: '+58'   },
  { name: 'Vietnam',               code: 'VN', dial: '+84'   },
  { name: 'Yemen',                 code: 'YE', dial: '+967'  },
  { name: 'Zimbabwe',              code: 'ZW', dial: '+263'  },
]

function CountryCodePicker({ value, onChange }) {
  const [open,   setOpen]   = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  const filtered = search.trim()
    ? COUNTRIES.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.dial.includes(search)
      )
    : COUNTRIES

  // close on outside click
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = COUNTRIES.find((c) => c.dial === value) || COUNTRIES.find((c) => c.code === 'LK')

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setSearch('') }}
        className="h-full flex items-center gap-1 bg-gray-700 border border-gray-600 rounded-l-lg px-3 text-white text-sm focus:outline-none focus:border-blue-500 whitespace-nowrap"
      >
        <span className="font-medium">{selected?.dial}</span>
        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-[100] bg-gray-800 border border-gray-600 rounded-lg shadow-2xl w-64">
          <div className="p-2">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country or code…"
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto">
            {filtered.map((c) => (
              <li key={`${c.code}-${c.dial}`}>
                <button
                  type="button"
                  onClick={() => { onChange(c.dial); setOpen(false); setSearch('') }}
                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center gap-2
                    ${c.dial === value ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                >
                  <span className="text-gray-400 w-10 flex-shrink-0">{c.dial}</span>
                  <span className="truncate">{c.name}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-gray-500 text-xs">No results</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function LicenseGate({ children }) {
  const [status,      setStatus]      = useState(null)
  const [daysLeft,    setDaysLeft]    = useState(0)
  const [showForm,    setShowForm]    = useState(false)
  const [serial,      setSerial]      = useState('')
  const [email,       setEmail]       = useState('')
  const [dialCode,    setDialCode]    = useState('+94')   // default Sri Lanka
  const [phone,       setPhone]       = useState('')
  const [company,     setCompany]     = useState('')
  const [error,       setError]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [success,     setSuccess]     = useState(false)
  const [dismissed,   setDismissed]   = useState(false)

  useEffect(() => { loadStatus() }, [])

  async function loadStatus() {
    const result = await window.electronAPI.licenseCheck()
    setStatus(result.status)
    setDaysLeft(result.daysLeft || 0)
    if (result.status === 'expired') setShowForm(true)
  }

  async function handleActivate() {
    if (!serial.trim()) { setError('Please enter your license key.'); return }
    if (!email.trim())  { setError('Please enter your email address.'); return }
    if (!phone.trim())  { setError('Please enter your phone number.'); return }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    if (!emailOk) { setError('Please enter a valid email address.'); return }

    const fullPhone = `${dialCode} ${phone.trim()}`

    setLoading(true)
    setError('')
    const result = await window.electronAPI.licenseActivate(
      serial.trim(), email.trim(), fullPhone, company.trim()
    )
    setLoading(false)
    if (result.ok) {
      setSuccess(true)
      setTimeout(() => {
        setStatus('active')
        setShowForm(false)
        setSuccess(false)
        setDismissed(false)
        setSetupTab('activate')
      }, 1500)
    } else {
      setError(result.error)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleActivate()
  }

  // ── First-run welcome screen ──────────────────────────────────────────────
  const [setupTab,       setSetupTab]       = useState('activate') // 'activate' | 'trial'
  const [trialLoading,   setTrialLoading]   = useState(false)

  async function handleStartTrial() {
    setTrialLoading(true)
    const result = await window.electronAPI.licenseStartTrial()
    setStatus(result.status)
    setDaysLeft(result.daysLeft || 0)
    setTrialLoading(false)
  }

  if (status === null) return null
  if (status === 'active') return children

  if (status === 'setup') {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md">

          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">🖥️</div>
            <h1 className="text-white text-2xl font-bold">ERPNext POS</h1>
            <p className="text-gray-400 text-sm mt-1">Welcome — choose how to get started</p>
          </div>

          {/* Tab switcher */}
          <div className="flex bg-gray-800 rounded-xl p-1 mb-6 gap-1">
            <button
              onClick={() => setSetupTab('activate')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
                ${setupTab === 'activate' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Activate License
            </button>
            <button
              onClick={() => setSetupTab('trial')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
                ${setupTab === 'trial' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Start Free Trial
            </button>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 shadow-2xl">

            {/* ── Activate tab ── */}
            {setupTab === 'activate' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-300 text-xs font-medium mb-1">
                    License Key <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={serial}
                    onChange={(e) => { setSerial(e.target.value.toUpperCase()); setError('') }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleActivate() }}
                    placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                    maxLength={24}
                    autoFocus
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white font-mono text-sm tracking-widest focus:outline-none focus:border-blue-500 placeholder-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-xs font-medium mb-1">
                    Email Address <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError('') }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleActivate() }}
                    placeholder="you@example.com"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-xs font-medium mb-1">
                    Phone Number <span className="text-red-400">*</span>
                  </label>
                  <div className="flex">
                    <CountryCodePicker value={dialCode} onChange={setDialCode} />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value); setError('') }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleActivate() }}
                      placeholder="77 123 4567"
                      className="flex-1 bg-gray-700 border border-gray-600 border-l-0 rounded-r-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-300 text-xs font-medium mb-1">
                    Company / Business Name <span className="text-gray-500 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => { setCompany(e.target.value); setError('') }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleActivate() }}
                    placeholder="ABC Trading (Pvt) Ltd"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
                  />
                </div>

                {error   && <p className="text-red-400 text-xs">{error}</p>}
                {success && <p className="text-green-400 text-xs font-medium">License activated! Starting…</p>}

                <button
                  onClick={handleActivate}
                  disabled={loading || !serial.trim() || !email.trim() || !phone.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
                >
                  {loading ? 'Verifying…' : 'Activate License'}
                </button>

                <p className="text-gray-600 text-xs text-center">
                  An internet connection is required. Contact your vendor for a key.
                </p>
              </div>
            )}

            {/* ── Trial tab ── */}
            {setupTab === 'trial' && (
              <div className="space-y-5 text-center">
                <div className="text-4xl">⏱️</div>
                <div>
                  <h3 className="text-white font-semibold text-base mb-1">30-Day Free Trial</h3>
                  <p className="text-gray-400 text-sm">
                    Full access to all features for 30 days — no credit card required.
                    You can activate your license key any time during or after the trial.
                  </p>
                </div>
                <ul className="text-gray-300 text-sm space-y-1.5 text-left">
                  {['Unlimited sales & invoices', 'All payment methods', 'Receipt printing', 'Sales summary & reports'].map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <span className="text-green-400 text-xs">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={handleStartTrial}
                  disabled={trialLoading}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
                >
                  {trialLoading ? 'Starting…' : 'Start 30-Day Trial'}
                </button>
                <p className="text-gray-600 text-xs">
                  Have a key? Switch to the Activate tab above.
                </p>
              </div>
            )}
          </div>

          <p className="text-center text-gray-600 text-xs mt-4">
            ERPNext POS · © {new Date().getFullYear()} Vijitha Rajapaksha
          </p>
        </div>
      </div>
    )
  }

  const urgentDays = daysLeft <= 7

  return (
    <>
      {/* Trial banner — non-blocking */}
      {status === 'trial' && !dismissed && (
        <div className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-4 px-5 py-2.5 text-sm shadow-lg
          ${urgentDays ? 'bg-red-700 text-white' : 'bg-amber-600 text-white'}`}
        >
          <span>
            {urgentDays ? '⚠ ' : ''}
            Trial period: <strong>{daysLeft} day{daysLeft !== 1 ? 's' : ''}</strong> remaining.
            {urgentDays ? ' Enter a license key before your trial expires.' : ''}
          </span>
          <div className="flex gap-3 flex-shrink-0">
            <button
              onClick={() => setShowForm(true)}
              className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs font-medium transition-colors"
            >
              Enter License Key
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="text-white/60 hover:text-white text-lg leading-none px-1"
              aria-label="Dismiss"
            >×</button>
          </div>
        </div>
      )}

      {/* App content — shifted down when banner visible */}
      {status === 'trial' && (
        <div className={!dismissed ? 'pt-10' : ''}>{children}</div>
      )}

      {/* License entry modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-6">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md p-8 space-y-5">

            {/* Header */}
            <div className="text-center space-y-1">
              {status === 'expired' ? (
                <>
                  <div className="text-red-400 text-4xl mb-2">🔒</div>
                  <h2 className="text-white text-xl font-bold">Trial Period Expired</h2>
                  <p className="text-gray-400 text-sm">Your 30-day trial has ended. Enter your license details to continue.</p>
                </>
              ) : (
                <>
                  <h2 className="text-white text-xl font-bold">Activate License</h2>
                  <p className="text-gray-400 text-sm">{daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining in your trial.</p>
                </>
              )}
            </div>

            {/* Fields */}
            <div className="space-y-3">

              {/* License Key */}
              <div>
                <label className="block text-gray-300 text-xs font-medium mb-1">
                  License Key <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={serial}
                  onChange={(e) => { setSerial(e.target.value.toUpperCase()); setError('') }}
                  onKeyDown={handleKeyDown}
                  placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                  maxLength={24}
                  autoFocus
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white font-mono text-sm tracking-widest focus:outline-none focus:border-blue-500 placeholder-gray-500"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-gray-300 text-xs font-medium mb-1">
                  Email Address <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError('') }}
                  onKeyDown={handleKeyDown}
                  placeholder="you@example.com"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
                />
              </div>

              {/* Phone with country code */}
              <div>
                <label className="block text-gray-300 text-xs font-medium mb-1">
                  Phone Number <span className="text-red-400">*</span>
                </label>
                <div className="flex">
                  <CountryCodePicker value={dialCode} onChange={setDialCode} />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setError('') }}
                    onKeyDown={handleKeyDown}
                    placeholder="77 123 4567"
                    className="flex-1 bg-gray-700 border border-gray-600 border-l-0 rounded-r-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
                  />
                </div>
              </div>

              {/* Company (optional) */}
              <div>
                <label className="block text-gray-300 text-xs font-medium mb-1">
                  Company / Business Name <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => { setCompany(e.target.value); setError('') }}
                  onKeyDown={handleKeyDown}
                  placeholder="ABC Trading (Pvt) Ltd"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
                />
              </div>

              {/* Error / Success */}
              {error   && <p className="text-red-400 text-xs">{error}</p>}
              {success && <p className="text-green-400 text-xs font-medium">License activated successfully!</p>}
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleActivate}
                disabled={loading || !serial.trim() || !email.trim() || !phone.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
              >
                {loading ? 'Verifying…' : 'Activate'}
              </button>
              {status === 'trial' && (
                <button
                  onClick={() => { setShowForm(false); setError('') }}
                  className="px-4 py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>

            <p className="text-gray-600 text-xs text-center">
              An internet connection is required to activate. Contact your vendor to obtain a license key.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
