# ERPNext POS — Release Notes

---

## v1.1.0 — 2026-05-09

### New Features

#### License Activation System
- **30-day free trial** starts automatically on first launch — no registration required
- Amber trial banner displays remaining days; turns red when ≤ 7 days remain
- Banner can be dismissed during the trial period
- After 30 days the app is fully blocked until a valid license key is entered
- License keys are HMAC-SHA256 verified — format `XXXXX-XXXXX-XXXXX-XXXXX`
- Activation is permanent on the machine once a valid key is entered
- 300,000 pre-generated keys available across three distribution packs (Pack A, B, C)

#### Dynamic Payment Methods from POS Profile
- Payment methods in the cashier panel are now loaded **directly from the ERPNext POS Profile**
- Adding or removing a payment method in ERPNext is immediately reflected in the POS — no app reconfiguration needed
- Works for any country and any payment method name (not limited to Cash / Card / Koko Pay)
- GL accounts are resolved automatically from ERPNext **Mode of Payment** records — the POS app no longer needs manual GL account configuration for standard payment methods

#### Gift Card GL Account Picker
- The Gift Card GL account setting in **Settings → Payment Methods** now shows a **load-and-select picker** displaying the full account name with number prefix (e.g. `200417 - Gift Card - IT`)
- Click **Load accounts** to fetch all GL accounts from ERPNext, then click to select
- The selected account is stored and used directly — no need to type account names manually
- Priority order for Gift Card account resolution:
  1. `gift_card` field on the POS Profile (ERPNext custom field)
  2. Account selected in POS App Settings (new picker)
  3. Automatic lookup from the Gift Card Mode of Payment record (fallback)

### Removed
- **Cash GL Account**, **Bank / Credit Card GL Account**, and **Koko Pay GL Account** manual pickers removed from Settings — these are no longer needed as ERPNext resolves GL accounts from Mode of Payment records automatically
- **Koko Pay — ERPNext Mode of Payment Name** field removed from Settings — payment method names come directly from the POS Profile

### Installer
- Clean NSIS installer — no customer registration or data collection during installation
- Choose installation directory, create desktop and Start Menu shortcuts, launch on finish
- No welcome page, no license agreement page

---

## v1.0.0 — Initial Release

### Features
- Electron + React + Tailwind CSS Windows desktop POS
- Full offline mode with disk cache (items, stock, sessions, invoice queue)
- ERPNext v14/v15 REST API integration (cookie-based auth, no CORS issues)
- POS Opening / Closing Entry management
- Payment methods: Cash, Credit Card, Koko Pay, Gift Card / Voucher
- Gift Card serial number validation against ERPNext Serial No doctype
- Credit (receivable) sales → ERPNext Sales Invoice
- Custom price selling levels per item (Retail / Wholesale)
- Bill-level discount (fixed or percentage)
- Hold and recall multiple draft bills
- Customer search with receivable aging
- Sales Summary modal with close-session workflow
- Offline invoice queue with auto-sync on reconnect
- On-screen virtual keyboard for touch-screen POS machines
- F-key shortcuts row (F1–F8, F12)
- Silent receipt printing (no dialog) to default printer
- Cash drawer kick via ESC/POS command over COM/LPT port
- Lock screen (Ctrl+L)
- Dark/Light theme toggle
- NSIS Windows installer (x64)
