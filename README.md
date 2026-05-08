# ERPNext POS — Windows Desktop Application

A standalone Windows POS terminal built with **Electron + React + Tailwind CSS**, connecting to an ERPNext instance (v14/v15) via REST API. Supports full **offline operation** — items, stock and sessions are cached to disk and invoices are queued locally when the server is unreachable.

---

## Quick Start (Cashier)

1. Install `ERPNext POS-Setup-1.0.0.exe` from the `release/` folder.
2. Launch **ERPNext POS** from the desktop shortcut.
3. Enter your ERPNext URL, username and password, then select your POS Profile.
4. Press **F2** at least once while online to cache items, stock and prices to disk.
5. The POS now works fully offline until you reconnect.

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
| `D` | Jump to Card input |
| `K` | Jump to Koko Pay input |
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
- Add payment methods: **Cash**, Card, Koko Pay, Gift Card etc.
- Set a default customer (e.g. **Walk-in Customer**)
- Assign the profile to users who will log in

### 2. Walk-in Customer
Create a customer named **Walk-in Customer** in ERPNext — used when no specific customer is selected at checkout.

### 3. Custom Price Selling Levels (optional)
Add a child table `custom_price_selling_levels` to the **Item** doctype:

| Field | Type | Label |
|-------|------|-------|
| `level` | Data | Level |
| `marked_price` | Currency | Marked Price |
| `discount_amount` | Currency | Discount |
| `our_price` | Currency | Our Price |
| `active` | Check | Active |
| `bill_type` | Data | Bill Type (`Retail` / `Wholesale`) |

### 4. Gift Card Account (optional)
Set the `gift_card` field on the POS Profile to the ERPNext GL account used for gift card redemptions, or configure it in **Settings → Gift Card Account**.

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
# Generate icon + build React app + package Windows installer
npm run dist
```

Installer output: `release/ERPNext POS-Setup-1.0.0.exe`

To build without packaging (faster iteration):
```bash
npm run dist:dir
```

---

## Project Structure

```
windows-pos-app/
├── electron/
│   ├── main.js            Electron main process, window controls, IPC handlers
│   └── preload.js         IPC bridge — exposes electronAPI to renderer
├── public/
│   ├── icon.ico           App icon (auto-generated from logo-source.png)
│   └── logo-source.png    Source logo PNG
├── scripts/
│   └── make-icon.js       Converts logo-source.png → icon.ico
├── release/
│   └── ERPNext POS-Setup-1.0.0.exe   Windows NSIS installer
├── src/
│   ├── components/
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
│   │   └── Settings.jsx           App settings (URL, accounts, cache clear)
│   ├── services/
│   │   ├── api.js         ERPNext REST API calls (Axios, cookie auth)
│   │   ├── auth.js        Login, session restore, logout
│   │   └── cache.js       Memory cache (5 min) + disk cache (7 day) + offline queue
│   ├── store/
│   │   └── posStore.js    Zustand global state
│   └── App.jsx
├── package.json
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
| HTTP | Axios (cookie-based ERPNext session auth) |
| Persistence | electron-store (disk key-value store) |
| Bundler | Vite 5 |
| Installer | electron-builder (NSIS) |

---

## License

Copyright © 2025 Vijitha Rajapaksha. All rights reserved.
