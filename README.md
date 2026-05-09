# ERPNext POS — Windows Desktop Application

A standalone Windows POS terminal built with **Electron + React + Tailwind CSS**, connecting to an ERPNext instance (v14/v15) via REST API. Supports full **offline operation** — items, stock and sessions are cached to disk and invoices are queued locally when the server is unreachable.

---

## Quick Start (Cashier)

1. Install `ERPNext POS-Setup-1.1.0.exe` from the `release/` folder.
2. Launch **ERPNext POS** from the desktop shortcut.
3. A **30-day free trial** starts automatically on first launch.
4. Enter your ERPNext URL, username and password, then select your POS Profile.
5. Press **F2** at least once while online to cache items, stock and prices to disk.
6. The POS now works fully offline until you reconnect.

---

## License Activation

The application includes a **30-day free trial**. After the trial period expires, a license key is required to continue using the software.

- **Trial active** — an amber banner displays the remaining days. The app is fully functional.
- **Trial expiring soon (≤ 7 days)** — the banner turns red with an urgent notice.
- **Trial expired** — the app is blocked until a valid license key is entered.

### Entering a License Key

1. Click **Enter License Key** in the trial banner, or wait for the activation screen after expiry.
2. Enter the key in `XXXXX-XXXXX-XXXXX-XXXXX` format.
3. Click **Activate** — the app unlocks permanently on that machine.

Contact your vendor to obtain a license key.

---

## Keyboard Shortcuts

### Global (always active)

| Key | Action |
|-----|--------|
| `Ctrl + L` | Lock screen |
| `Ctrl + Q` | Log out |

### Item Search & Grid

| Key | Action |
|-----|--------|
| `F1` | Focus item search bar |
| `Ctrl + F` | Focus item search bar |
| `Arrow Keys` | Navigate item grid tiles |
| `Enter` | Open selected item dialog |

### Bill / Right Panel

| Key | Action |
|-----|--------|
| `F1` | New Bill |
| `F2` | **Sync / Reload** — fetches latest items, prices & stock from ERPNext and caches to disk |
| `F3` | **Draft Save** — holds current bill so you can start another |
| `F4` | Cancel current bill |
| `F5` | Sales Summary (session report) |
| `F6` | Focus discount input |
| `F7` | Toggle **Retail / Wholesale** bill type |
| `F8` | Toggle **Cash / Credit** payment mode |
| `F12` | Open Payment / Checkout screen |
| `+` / `Numpad Add` | Open Payment / Checkout screen (works from search bar) |
| `-` / `Numpad −` | **Recall** — open saved drafts list |
| `Arrow Up / Down` | Move selected row up/down in bill |
| `Enter` | Edit quantity of selected bill row |
| `Delete` | Remove selected bill row |

### Payment Screen

| Key | Action |
|-----|--------|
| `Enter` | Confirm payment |
| `Escape` | Cancel / close payment screen |
| `Tab` | Cycle through payment method inputs |
| `F8` | Toggle Cash / Credit mode |
| `C` | Jump to Cash input |
| `D` | Jump to Card/Bank input |
| `K` | Jump to Koko-type payment input |
| `G` | Enable Gift Card / Voucher panel |

---

## Features

### Sales
- Item grid with category tabs, live search, barcode scanner support
- Optional item image display (toggle with **Images ON/OFF**)
- Custom price levels per item (`custom_price_selling_levels`) — auto-applied for single level, selection popup for multiple
- Retail / Wholesale bill type switching (F7)
- Bill-level discount — fixed amount or percentage (F6)
- Hold and recall multiple draft bills (F3 / −)
- Customer search with outstanding receivable aging display
- Gift Card / Voucher redemption with serial number validation
- Credit (receivable) sales → creates ERPNext Sales Invoice

### Payment Methods
- Payment methods are loaded **dynamically from the POS Profile** — any mode of payment configured in ERPNext appears automatically in the cashier panel
- GL accounts are resolved from ERPNext's **Mode of Payment** records — no manual account configuration required in the POS app
- Gift Card GL account can be set manually in **Settings → Payment Methods → Gift Card GL Account**

### Offline Mode
- Items, item groups, warehouse stock and POS session cached to disk (7-day TTL)
- Item detail cached to disk on first click — used on subsequent offline visits
- Item search works offline via client-side filtering of the disk cache
- Offline invoices queued to disk and synced automatically when ERPNext reconnects
- Offline queue modal shows per-invoice sync status
- F2 Sync pre-caches all items and stock for reliable offline use

### Session Management
- Detects open POS sessions on login; prompts to open one if none found
- POS session cached to disk — restored automatically when starting offline
- Sales Summary (F5) shows totals by payment mode; close session from here
- Lock screen (Ctrl+L) with PIN or cashier name unlock

### Interface
- Dark UI with optional light theme toggle
- Cashier full name shown in title bar (fetched from ERPNext User profile)
- Online / Offline status indicator in title bar
- Offline invoice queue badge — click to open sync modal
- Hide/Show item panel toggle for small-screen layouts

---

## ERPNext Configuration

### 1. POS Profile
- Create a POS Profile linked to a warehouse and company
- Add payment methods under **Payment Methods** tab (Cash, Credit Card, Koko Payment, etc.)
- Payment methods added here appear automatically in the POS cashier panel — no additional app configuration needed
- Set a default customer (e.g. **Walk-in Customer**)
- Assign the profile to users who will log in

### 2. Mode of Payment — GL Accounts
Each Mode of Payment in ERPNext must have a **Default Account** set for your company:

1. Go to **Accounting → Mode of Payment**
2. Open each payment method (Cash, Credit Card, Koko Payment, etc.)
3. In the **Accounts** table, add a row for your company and select the GL account
4. **Save**

The POS app reads these accounts automatically — you do not need to configure GL accounts in the POS app settings (except for Gift Card, see below).

### 3. Gift Card Account
The Gift Card GL account can be configured in two ways (checked in priority order):

1. **POS Profile field** — set `gift_card` custom field on the POS Profile to the full GL account name
2. **POS App Settings** — open Settings → Payment Methods → **Gift Card GL Account** → click **Load accounts** → select the account

> The **Gift Card GL Account** picker shows the **full account name including the number prefix** (e.g. `200417 - Gift Card - IT`). Select the exact account used in ERPNext.

If neither is configured, the app falls back to resolving the account from the **Gift Card** Mode of Payment record automatically.

### 4. Walk-in Customer
Create a customer named **Walk-in Customer** in ERPNext — used when no specific customer is selected at checkout.

### 5. Custom Price Selling Levels (optional)
Add a child table `custom_price_selling_levels` to the **Item** doctype:

| Field | Type | Label |
|-------|------|-------|
| `level` | Data | Level |
| `marked_price` | Currency | Marked Price |
| `discount_amount` | Currency | Discount |
| `our_price` | Currency | Our Price |
| `active` | Check | Active |
| `bill_type` | Data | Bill Type (`Retail` / `Wholesale`) |

---

## Development Setup

```bash
# Install dependencies
npm install

# Start dev server (Vite + Electron simultaneously)
npm run dev
```

## Production Build

```bash
# Build React app + package Windows installer
npm run dist
```

Installer output: `release/ERPNext POS-Setup-1.1.0.exe`

To build without packaging (faster iteration):
```bash
npm run dist:dir
```

### Generating License Keys

```bash
node scripts/generate-serials.js
```

Outputs three CSV files (`serials-pack-A.csv`, `serials-pack-B.csv`, `serials-pack-C.csv`) with 100,000 keys each. **Do not commit these files to git** — they are listed in `.gitignore`.

---

## Project Structure

```
windows-pos-app/
├── electron/
│   ├── main.js            Electron main process, window controls, IPC handlers
│   ├── preload.js         IPC bridge — exposes electronAPI to renderer
│   └── license.js         License validation (trial period + serial key HMAC check)
├── public/
│   ├── icon.ico           App icon
│   └── logo-source.png    Source logo PNG
├── scripts/
│   ├── make-icon.js       Converts logo-source.png → icon.ico
│   └── generate-serials.js  Generates 300,000 HMAC-verified license keys (3 packs)
├── release/
│   └── ERPNext POS-Setup-1.1.0.exe   Windows NSIS installer
├── src/
│   ├── components/
│   │   ├── LicenseGate.jsx        Trial banner + license activation screen
│   │   ├── Login.jsx              Login screen + POS Profile selection
│   │   ├── POSMain.jsx            Main layout, keyboard shortcuts, sync logic
│   │   ├── ItemGrid.jsx           Item search, category tabs, item grid, offline cache
│   │   ├── BillTable.jsx          Current bill, totals, discount, draft save/recall
│   │   ├── PaymentModal.jsx       Checkout screen, payment methods, offline queuing
│   │   ├── ItemDialog.jsx         Item qty & price level selection popup
│   │   ├── CustomerSearch.jsx     Customer lookup with receivable aging
│   │   ├── POSOpeningModal.jsx    Open/resume POS session
│   │   ├── SalesSummaryModal.jsx  Session sales report + close session
│   │   ├── OfflineQueueModal.jsx  Offline invoice queue viewer & sync
│   │   ├── AddItemBar.jsx         Quick add bar (hidden-items layout)
│   │   └── Settings.jsx           App settings (URL, gift card account, cache clear)
│   ├── services/
│   │   ├── api.js         ERPNext REST API calls
│   │   ├── auth.js        Login, session restore, logout
│   │   └── cache.js       Memory + disk cache + offline queue
│   ├── store/
│   │   └── posStore.js    Zustand global state
│   └── App.jsx
├── package.json
├── electron-builder.yml
├── vite.config.js
└── tailwind.config.js
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | Electron 27 |
| UI | React 18 + Tailwind CSS 3 |
| State | Zustand |
| HTTP | Node.js `http`/`https` (cookie-based ERPNext session auth) |
| Persistence | electron-store (disk key-value store) |
| Bundler | Vite 5 |
| Installer | electron-builder (NSIS) |

---

## License

Copyright © 2025 Vijitha Rajapaksha. All rights reserved.
