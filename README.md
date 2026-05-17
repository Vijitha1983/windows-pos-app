# Orbis POS — Windows Desktop Application

A standalone Windows POS terminal built with **Electron + React + Tailwind CSS**, connecting to an ERPNext instance (v14/v15) via REST API. Supports full **offline operation** — items, stock and sessions are cached to disk and invoices are queued locally when the server is unreachable.

> **Current version:** 1.3.8 — by [Infotop](https://infotop.lk)

---

## Quick Start (Cashier)

1. Install `Orbis POS-Setup-1.3.8.exe` from the `release/` folder.
2. Launch **Orbis POS** from the desktop shortcut.
3. A **30-day free trial** starts automatically on first launch.
4. Enter your ERPNext URL (e.g. `https://yoursite.erpnext.com`), username and password, then select your POS Profile.
5. Press **F2** at least once while online to cache items, stock, prices and promotional schemes to disk.
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
| `F2` | **Sync / Reload** — fetches latest items, prices, stock & promo schemes from ERPNext and caches to disk |
| `F3` | **Draft Save** — holds current bill so you can start another |
| `F4` | Cancel current bill |
| `F5` | Sales Summary (session report) |
| `F6` | Focus discount input |
| `F7` | Toggle **Retail / Wholesale** bill type |
| `F8` | Toggle **Cash / Credit** payment mode |
| `F9` | Customer Search |
| `F10` | Return / Exchange |
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
- Customer search with outstanding receivable aging display (F9)
- Gift Card / Voucher redemption with serial number validation
- Credit (receivable) sales → creates ERPNext Sales Invoice
- Default customer loaded from POS Profile configuration

### Promotional Schemes (Auto-Apply from ERPNext)
- Active ERPNext Promotional Schemes are fetched on login and F2 Sync, cached to disk for offline use
- **Price Discount** — when item quantity reaches a configured slab threshold, the unit price is automatically updated to the promotional rate. Original list price is shown crossed-out in amber; a `PROMO` badge is displayed alongside the promotional price
- **Product Discount (Free Item)** — when item quantity reaches a slab threshold, a free item row is automatically inserted below the parent item. Supports `same_item=1` (free unit of the same purchased item) and separate free item codes
- Free item rows display a `FREE` badge, zero price, and are locked — they cannot be manually edited or removed independently
- Removing a parent item automatically removes its linked free row
- Schemes are matched per item code or item group as configured in ERPNext (`items` child table). Empty items table = applies to all items
- Header badge shows active promo count with scheme names on hover

### Returns & Exchanges
- Full return workflow — search by original invoice number, select items to return, submit credit note to ERPNext
- Exchange flow — return items and immediately start a new bill for replacements
- Open with **F10** or the Return button in the bill header

### Tax Calculation
- POS invoices carry tax automatically when submitted to ERPNext
- Three-tier tax resolution:
  1. **Tax Rule lookup** — if the customer or POS Profile has a `tax_category`, the matching ERPNext Tax Rule is fetched and its Sales Tax Template applied
  2. **POS Profile taxes fallback** — taxes configured directly on the POS Profile
  3. **Item Tax Template** — each invoice line carries `item_tax_template` from the ERPNext Item Tax child table (India GST item-level compliance)

### Payment Methods
- Payment methods are loaded **dynamically from the POS Profile** — any mode of payment configured in ERPNext appears automatically in the cashier panel
- GL accounts are resolved from ERPNext's **Mode of Payment** records — no manual account configuration required in the POS app
- Gift Card GL account can be set manually in **Settings → Payment Methods → Gift Card GL Account**

### Offline Mode
- Items, item groups, warehouse stock, POS session, and promotional schemes cached to disk (7-day TTL)
- Item detail cached to disk on first click — used on subsequent offline visits
- Item search works offline via client-side filtering of the disk cache
- Offline invoices queued to disk and synced automatically when ERPNext reconnects
- Offline queue modal shows per-invoice sync status
- F2 Sync pre-caches all items, stock and promos for reliable offline use

### Session Management
- Detects open POS sessions on login; prompts to open one if none found
- POS session cached to disk — restored automatically when starting offline
- Sales Summary (F5) shows totals by payment mode; close session from here
- Lock screen (Ctrl+L) with PIN or cashier name unlock

### Touch Mode & Virtual Keyboard
- Enable **Touch Mode** in Settings for tablet / touchscreen deployments
- A permanent F-key toolbar (F1–F12) is pinned to the bottom of the screen at all times in touch mode — all shortcuts accessible without a physical keyboard
- Full on-screen keyboard appears automatically when any input field is focused
- QWERTY layout with numpad on the right for text fields; compact numpad-only layout for numeric fields
- Virtual keyboard works alongside all F-key shortcuts — no physical keyboard needed for full POS operation

### Interface
- Dark UI with optional light theme toggle
- Cashier full name shown in title bar (fetched from ERPNext User profile)
- Company name shown on the login screen (fetched from ERPNext after login)
- Online / Offline status indicator in title bar
- Offline invoice queue badge — click to open sync modal
- Hide/Show item panel toggle for small-screen layouts

---

## ERPNext Configuration

### 1. POS Profile
- Create a POS Profile linked to a warehouse and company
- Add payment methods under **Payment Methods** tab (Cash, Credit Card, Koko Payment, etc.)
- Payment methods added here appear automatically in the POS cashier panel — no additional app configuration needed
- Set a default customer (e.g. **Walk-in Customer**) — this name is shown in the customer search field
- Assign the profile to users who will log in
- Optionally set `tax_category` on the POS Profile for automatic tax resolution

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

### 4. Walk-in / Default Customer
Create the customer configured in your POS Profile's **Customer** field (e.g. **Walk-in Customer**) in ERPNext — used when no specific customer is selected at checkout.

### 5. Tax Rules (optional — recommended for automatic tax)
To have tax auto-applied on POS invoices:

1. Go to **Accounts → Tax Rule → New**
2. Set **Selling** = Yes, **Company**, and **Tax Category**
3. Set **Sales Tax Template** to your applicable tax template (e.g. *Output VAT 18%*)
4. Assign the same `tax_category` to your customers or POS Profile

The POS resolves taxes at checkout via this rule and injects them into the submitted invoice.

### 6. Item Tax Templates (India GST)
For item-level GST compliance, add tax templates to items in ERPNext:

1. Open the Item → **Item Tax** table
2. Add a row with the applicable **Item Tax Template** (e.g. *GST 18%*)

The POS fetches these templates at checkout and attaches them to each invoice line.

### 7. Promotional Schemes
Configure in **Accounts → Promotional Scheme → New**:

- Set **Price Discount** or **Product Discount** type
- Add slabs under **Price Discount Slabs** or **Product Discount Slabs**
- In the **Items** child table, add the item codes or item groups the scheme applies to (leave empty to apply to all items)
- Enable the scheme and set validity dates

Active schemes are automatically fetched on login and F2 Sync.

### 8. Custom Price Selling Levels (optional)
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
# Build React app + package Windows installer (.exe)
npm run dist
```

Installer output: `release/Orbis POS-Setup-1.3.8.exe`

To build without packaging (faster iteration):
```bash
npm run dist:dir
```

### Customer Update Package

When releasing a patch or feature update, you can send customers a small update zip (~4 MB) instead of a full reinstaller (~80 MB):

```bash
npm run make-update
```

Output: `updates/Orbis-POS-Update-v1.3.8.zip`

The zip contains `app.asar` (all app code) and `install-update.bat`. The customer unzips and double-clicks the bat file — no reinstall required. See `UPDATE-DELIVERY.md` for the full delivery workflow.

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
│   ├── main.js              Electron main process, window controls, IPC handlers
│   ├── preload.js           IPC bridge — exposes electronAPI to renderer
│   └── license.js           License validation (trial period + serial key HMAC check)
├── public/
│   ├── icon.ico             App icon
│   └── logo-source.png      Source logo PNG
├── scripts/
│   ├── make-icon.js         Converts logo-source.png → icon.ico
│   ├── make-update.js       Builds versioned update zip for customer delivery
│   └── generate-serials.js  Generates 300,000 HMAC-verified license keys (3 packs)
├── src/
│   ├── components/
│   │   ├── LicenseGate.jsx        Trial banner + license activation screen
│   │   ├── Login.jsx              Login screen + POS Profile selection
│   │   ├── POSMain.jsx            Main layout, keyboard shortcuts, sync logic
│   │   ├── ItemGrid.jsx           Item search, category tabs, item grid, offline cache
│   │   ├── BillTable.jsx          Current bill, totals, discount, draft save/recall
│   │   ├── PaymentModal.jsx       Checkout screen, payment methods, tax injection, offline queuing
│   │   ├── ItemDialog.jsx         Item qty & price level selection popup
│   │   ├── CustomerSearch.jsx     Customer lookup with receivable aging
│   │   ├── POSOpeningModal.jsx    Open/resume POS session
│   │   ├── SalesSummaryModal.jsx  Session sales report + close session
│   │   ├── OfflineQueueModal.jsx  Offline invoice queue viewer & sync
│   │   ├── AddItemBar.jsx         Quick add bar (hidden-items layout)
│   │   ├── ReturnTab.jsx          Return / Exchange workflow
│   │   ├── VirtualKeyboard.jsx    On-screen keyboard + permanent F-key bar (touch mode)
│   │   └── Settings.jsx           App settings (URL, gift card account, touch mode, cache clear)
│   ├── services/
│   │   ├── api.js           ERPNext REST API calls (items, customers, taxes, promos)
│   │   ├── auth.js          Login, session restore, logout
│   │   ├── cache.js         Memory + disk cache + offline queue
│   │   └── promotions.js    Promotional scheme matching & application logic
│   ├── store/
│   │   └── posStore.js      Zustand global state
│   └── App.jsx
├── CHANGELOG.md
├── UPDATE-DELIVERY.md       Developer guide for customer update delivery
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
| HTTP | Node.js `http`/`https` (cookie-based ERPNext session auth) |
| Persistence | electron-store (disk key-value store) |
| Bundler | Vite 5 |
| Installer | electron-builder (NSIS) |

---

## License

Copyright © 2025 Infotop. All rights reserved.
