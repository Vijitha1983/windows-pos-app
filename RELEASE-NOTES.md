# Orbis POS — Release Notes

**Product:** Orbis POS — Windows Desktop Application
**Platform:** Windows 10 / 11 (x64)
**ERPNext Compatibility:** v14, v15
**Developer:** Infotop
**Copyright:** © 2025 Infotop. All rights reserved.

---

## v1.3.8 — 2026-05-18

### Overview

Version 1.3.8 delivers automatic tax calculation on POS invoices, full touch-mode keyboard support, and a lightweight customer update delivery system.

---

### New Features

#### Automatic Tax Calculation on POS Invoices

POS invoices submitted to ERPNext now carry the correct tax automatically — no manual tax entry required at the counter.

Tax is resolved in priority order:

1. **Tax Rule lookup** — if the customer or POS Profile has a `tax_category`, the app queries ERPNext's Tax Rule doctype to find the matching Sales Tax Template and injects all tax rows into the invoice.
2. **POS Profile taxes fallback** — if no Tax Rule matches, taxes configured directly on the POS Profile (`taxes` child table and `taxes_and_charges` template) are used.
3. **Item Tax Template** — each invoice line carries its `item_tax_template` (fetched from ERPNext's Item Tax child table), enabling item-level GST compliance for India and similar multi-rate regimes.

Tax resolution runs before invoice submission; the offline queue fallback also carries taxes so queued invoices are not submitted without tax when connectivity is restored.

**ERPNext setup:** Go to **Accounts → Tax Rule → New**, set Selling = Yes, Company, Tax Category, and Sales Tax Template. Assign the same `tax_category` to customers or the POS Profile.

#### Touch Mode — All Function Buttons Always Active

All F-key shortcuts are now fully accessible when using Orbis POS on a touchscreen or tablet without a physical keyboard.

- The **F-key toolbar** (F1 New Bill, F2 Sync, F3 Hold, F5 Summary, F6 Discount, F7 Retail/WS, F8 Cash/Cr, F9 Customer, F10 Return, F12 PAY) is **permanently pinned to the bottom of the screen** whenever Touch Mode is enabled — even when no input field is focused.
- All function buttons dispatch keyboard events identical to physical key presses — every feature reachable by keyboard is reachable by touch.
- F1, F6 and other shortcuts now fire correctly from the virtual keyboard even when an input field has focus (previous guard removed).
- The main layout adds bottom padding in touch mode so the F-key bar never overlaps bill content.

#### Customer Update Delivery System

Sending updates to installed customers no longer requires distributing a full 80 MB installer.

- **`npm run make-update`** — new developer script that builds the app, packs it into `app.asar`, and creates a versioned zip (`Orbis-POS-Update-v{version}.zip`, typically 3–5 MB).
- The zip contains `app.asar` (all app code) and `install-update.bat`.
- `install-update.bat` auto-detects the installation location (user-level `%LOCALAPPDATA%` or machine-wide `%PROGRAMFILES%`), kills the running app, backs up the previous `app.asar` as `.bak`, and applies the update in seconds.
- `UPDATE-DELIVERY.md` added to the project — full developer guide covering build workflow, rollback instructions, and when a full installer is required vs. an app.asar update.

---

### Improvements

- `getCustomers` API call now fetches `tax_category` so customer tax categories are available at checkout without an extra round-trip.
- `updates/` folder added to `.gitignore` — built update packages are never accidentally committed.

---

### Bug Fixes

- Virtual keyboard F-key bar was only visible when an input field was focused — now always shown in touch mode.
- F1 (New Bill) was blocked when a text input had focus in touch mode — fixed.
- F6 (Discount) was blocked when a text input had focus in touch mode — fixed.

---

## v1.3.7 — 2026-05-17

### Overview

Version 1.3.7 is a major feature release introducing automatic promotional scheme application, a Return/Exchange shortcut, and a complete rebrand to **Orbis POS by Infotop**.

---

### New Features

#### Promotional Schemes (Auto-Apply from ERPNext)

Active ERPNext Promotional Schemes are fetched on login and F2 Sync, cached to disk for offline use, and applied automatically as items are added to the bill.

- **Price Discount** — when item quantity reaches a configured slab threshold, the unit price is automatically updated to the promotional rate. The original list price is shown crossed-out in amber; a `PROMO` badge appears alongside the promotional price.
- **Product Discount (Free Item)** — when item quantity reaches a slab threshold, a free item row is inserted below the parent item automatically. Supports `same_item=1` (a free unit of the same purchased item) and separate free item codes configured in ERPNext.
- Free item rows show a `FREE` badge, zero price, and are locked — they cannot be manually edited or removed independently.
- Removing a parent item automatically removes its linked free row.
- Schemes are matched per item code or item group as configured in ERPNext (`items` child table). An empty items table means the scheme applies to all items.
- A header badge shows the count of active promo schemes with scheme names on hover.
- Promo schemes are cached to disk on sync and restored on startup for reliable offline use.
- Free items are submitted to ERPNext with `qty` and `rate: 0` so stock is correctly deducted.
- Price-promotional unit price is sent as the invoice line `rate` — the promotional price becomes the official unit price in ERPNext.

**ERPNext setup:** Go to **Accounts → Promotional Scheme → New**. Configure Price Discount or Product Discount slabs. Add item codes or item groups in the Items child table (leave empty for all items).

#### Keyboard Shortcut — F10 Return / Exchange

- `F10` opens the Return / Exchange modal from anywhere in the POS.
- The Return button in the bill header displays an `F10` hint label.
- F10 is blocked when other modals (payment, item dialog, etc.) are already open.

#### Default Customer from POS Profile

- The customer search field now shows the POS Profile's configured default customer name (e.g. "Cash Customer", "Walk-in") instead of the hardcoded placeholder.
- Credit sale validation also uses the POS Profile's default customer as the exclusion reference.

---

### Branding

- App rebranded to **Orbis POS** by Infotop.
- Login screen title updated to "Orbis POS"; company name shown as subtitle after login.
- Window title, taskbar name, installer product name, and desktop shortcut all updated.
- ERPNext URL field pre-filled with `https://` so users type only the domain.

---

## v1.2.0 — 2026-05-10

### Overview

Version 1.2.0 is a security update that introduces online license activation with per-machine binding, making it impossible to use a single license key on more than one computer. All v1.1.0 license keys are invalidated — only the new v1.2.0 keys will work with this version.

---

### New Features

#### Online License Activation with Machine Binding

The license system has been completely redesigned to prevent a single key from being shared across multiple installations.

- **Per-machine binding** — when a license key is activated, the application records a hardware fingerprint of the machine (derived from hostname, CPU model, and network adapter MAC address). On every subsequent launch, the stored fingerprint is compared against the current machine. If they differ (i.e. the licence data was copied to another computer), the app immediately treats the licence as expired.
- **Online activation server** — activation is now verified against a secure cloud server (Google Apps Script + Google Sheets). The server records which machine activated which key. If the same key is submitted from a different machine, the server rejects it.
- **Re-activation on the same machine** — a key can be activated multiple times on the same machine (e.g. after a reinstall) without any problem.
- **Offline fallback** — if the activation server is temporarily unreachable (network outage, Google service disruption), activation is still allowed locally so that legitimate users are not blocked. Machine binding still applies in offline mode.
- **All v1.1.0 keys invalidated** — the internal key-signing secret has been changed. Any key distributed with v1.1.0 will be rejected by v1.2.0 automatically. New keys must be generated and distributed.

---

### Changes and Removals

| Change | Detail |
|---|---|
| License key format | Unchanged (`XXXXX-XXXXX-XXXXX-XXXXX`) but the signing secret is new — all v1.1.0 keys are invalid |
| New serial CSV files | `serials-pack-A.csv`, `serials-pack-B.csv`, `serials-pack-C.csv` (300,000 new keys total) |
| Machine binding added | App stores and verifies machine fingerprint at every launch |
| Online server check | Activation now calls the cloud server; rejected if key already used on a different machine |

---

## v1.1.0 — 2026-05-09

### Overview

Version 1.1.0 introduces a commercial license activation system, fully dynamic payment method integration from ERPNext POS Profiles, an improved Gift Card GL account picker, and significant performance improvements across sync, reporting, and checkout.

---

### New Features

#### License Activation System

The application now includes a built-in trial and license enforcement system designed for commercial distribution.

- **30-day free trial** begins automatically on the very first launch with no registration, internet check, or account creation required. The trial start date is stored locally on the machine.
- **Trial banner** — an amber notification bar is displayed at the top of the POS screen showing the number of days remaining. When 7 or fewer days remain the banner turns red to indicate urgency. The banner can be dismissed by the cashier during the trial period.
- **Trial expiry** — once the 30-day trial period ends, the application is fully blocked. A full-screen activation prompt is displayed and no POS functions are accessible until a valid license key is entered.
- **License key format** — keys follow the pattern `XXXXX-XXXXX-XXXXX-XXXXX` (20 characters in 4 groups of 5, separated by dashes). Keys are validated locally using HMAC-SHA256 — no internet connection or server call is required at activation time.
- **Permanent activation** — once a valid key is entered and accepted, the license is stored permanently on that machine. The app will never ask for a key again on the same machine.
- **Distribution packs** — 300,000 keys are pre-generated across three distribution packs:
  - Pack A — first character in range `A–H` (100,000 keys)
  - Pack B — first character in range `J–R` (100,000 keys)
  - Pack C — first character in range `S–Z` (100,000 keys)
- **Key generation** — run `node scripts/generate-serials.js` to regenerate all three CSV files. The output files (`serials-pack-A.csv`, `serials-pack-B.csv`, `serials-pack-C.csv`) are excluded from git via `.gitignore` and must never be committed.

---

#### Dynamic Payment Methods from POS Profile

Payment methods displayed in the cashier checkout panel are now sourced directly from the ERPNext POS Profile, replacing the previous hardcoded Cash / Card / Koko Pay layout.

- **Automatic discovery** — when the cashier opens the payment screen, the app reads the `payments` child table from the active POS Profile. Every mode of payment listed there appears as a payment row, in the same order as configured in ERPNext.
- **No app configuration required** — adding a new payment method (e.g. a local mobile wallet, a bank transfer method, or a voucher scheme) in the ERPNext POS Profile immediately makes it available in the POS app on the next login. No settings change or app update is needed.
- **GL account resolution** — the GL debit account for each payment method is resolved automatically by reading the **Mode of Payment** document in ERPNext. Each Mode of Payment has a per-company accounts table; the POS app finds the correct account for the active company at submission time.
- **Works internationally** — because payment method names are read verbatim from ERPNext, the POS is not limited to any specific language or country. Any mode of payment name recognised by ERPNext will work.
- **Cash always present** — if Cash is not listed in the POS Profile's payment methods, it is still added automatically as the first row to ensure a cash option is always available.

---

#### Gift Card GL Account Picker

The Gift Card GL account field in **Settings → Payment Methods** has been upgraded from a plain text input (requiring the user to type the exact internal account name) to a load-and-select picker.

- **Load accounts** — click the **Load accounts** button to fetch all non-group GL accounts from ERPNext for the active company. Accounts are displayed with their full name including the number prefix (e.g. `200417 - Gift Card - IT`).
- **One-click selection** — click any account in the list to select it. The full account name is stored and used directly when processing gift card payments.
- **Persistent setting** — the selected account is saved in the app's local settings store and survives restarts and updates.
- **Priority resolution order** — when a gift card payment is enabled at checkout, the GL account is resolved in the following priority order:
  1. `gift_card` custom field on the ERPNext POS Profile (set in ERPNext — highest priority)
  2. Account stored via the POS App Settings picker (described above)
  3. Automatic lookup from the **Gift Card** Mode of Payment document's accounts table (fallback)
- If none of the above resolves an account, the cashier sees a warning and the gift card panel cannot be confirmed.

---

#### Performance Improvements

F2 sync, the Sales Summary report, and billing checkout have all been significantly accelerated.

**F2 Sync (Reload)**

Previously the sync performed three sequential API calls: item groups → items → warehouse stock. Each step waited for the previous to complete, making the total sync time approximately the sum of all three response times.

- Item groups, all items, and warehouse stock are now fetched in **parallel** using a single `Promise.all` round. On a typical server the sync completes in roughly the time of the slowest single call rather than the sum.
- Item page size increased from 100 to **500 items per request**. Catalogues with up to 500 items are fetched in a single call; larger catalogues are automatically paginated.
- All disk cache writes (item groups, items, stock) are also performed in parallel after the fetches complete.

**Sales Summary Report**

Previously the summary loaded the POS invoice list and credit invoice list sequentially, then fetched each individual invoice one at a time to build the category breakdown — a classic N+1 query pattern.

- POS invoices and credit (Sales) invoices are now fetched in **parallel**.
- Category breakdown now uses two **bulk child-table queries** (`POS Invoice Item` and `Sales Invoice Item`) instead of fetching each invoice document individually. 50 invoices previously required 50+ API calls; it now requires 2.

**Billing Checkout**

Previously each sale required three sequential API calls: create draft → re-fetch draft (to obtain the server's `modified` timestamp) → submit. The intermediate re-fetch was introduced to avoid `TimestampMismatchError` but is unnecessary because the create response already includes the complete document with the correct `modified` value.

- The re-fetch GET has been eliminated. Each sale now takes **two API calls** (create + submit) instead of three, reducing checkout response time by approximately one full round-trip.

---

### Changes and Removals

The following settings fields have been removed from **Settings → Payment Methods** because they are no longer needed:

| Removed Field | Reason |
|---|---|
| Cash GL Account | ERPNext resolves the Cash account from the Mode of Payment record automatically |
| Bank / Credit Card GL Account | Same — resolved automatically |
| Koko Pay GL Account | Same — resolved automatically |
| Koko Pay — ERPNext Mode of Payment Name | Payment method names now come directly from the POS Profile; no manual mapping needed |

The Gift Card GL Account field remains but has been upgraded to the load-and-select picker described above.

---

### Bug Fixes

- **Improved "HTTP 0" error message** — when the POS cannot reach the ERPNext server (wrong URL, network down, HTTPS not specified), the error message now reads: *"Cannot connect to server. Check the URL (include https://) and your network connection."* Previously it showed the cryptic `HTTP 0` status code with no guidance.

---

### Installer

- Clean NSIS installer with no customer registration form, no telemetry, and no data collection during installation.
- User can choose the installation directory (defaults to `C:\Program Files\ERPNext POS`).
- Options to create a Desktop shortcut and a Start Menu entry.
- **Launch on finish** checkbox — the app starts immediately after installation completes.
- No welcome page. No license agreement page.
- Uninstall does not delete user data (`app-data/` folder is preserved so settings, cache, and offline queue survive a reinstall or upgrade).

---

### Known Issues and Workarounds

| Issue | Workaround |
|---|---|
| **Antivirus false positive** — unsigned Electron apps may be flagged by Windows Defender or third-party AV software on first install | Temporarily disable real-time protection during installation, or add an exclusion for the install folder. A code-signing certificate eliminates this permanently. |
| **"ERPNext POS cannot be closed" during upgrade** — the NSIS installer cannot overwrite the running application | Close the POS app completely before running the new installer. |
| **Session close fails with "Item Price updated"** | In ERPNext go to **Stock Settings** → uncheck **Auto Update Price List Rate Based on Transaction** |
| **Session close fails with Serial No / Batch No error** | Open the flagged invoices in ERPNext, add the missing Serial / Batch numbers to the item lines, then try closing again |

---

## v1.0.0 — Initial Release

### Overview

Version 1.0.0 is the first production release of the ERPNext POS Windows desktop application. It provides a full-featured point-of-sale terminal that connects to an ERPNext v14/v15 instance via REST API and supports complete offline operation.

---

### Features

#### Core Technology

- Built with **Electron 27** (Chromium-based desktop shell), **React 18** (UI), **Tailwind CSS 3** (styling), **Zustand** (state management), and **Vite 5** (bundler).
- All HTTP communication goes through the Electron main process, completely bypassing browser CORS and SameSite cookie restrictions. No proxy server or CORS configuration in ERPNext is required.
- Cookie-based ERPNext session authentication — the same session cookie the browser uses. Sessions persist across app restarts until the cookie expires or the user logs out.
- **electron-store** provides a key-value store on disk for settings, cache, and the offline invoice queue.

#### Sales

- **Item grid** with category tabs across the top, live text search, and barcode scanner support (any USB/Bluetooth HID scanner that sends keystrokes works out of the box).
- **Item images** — optional image display on item cards, toggled with the *Images ON/OFF* button. Images are loaded from ERPNext and cached locally.
- **Custom price selling levels** — if an item in ERPNext has a `custom_price_selling_levels` child table, the POS reads those levels at item selection time. If only one active level matches the current bill type (Retail/Wholesale) it is applied automatically; if multiple levels match a selection popup appears.
- **Retail / Wholesale bill type** — toggle with F7 or the button in the bill header. The bill type is applied to price level selection for all items in the current bill.
- **Bill-level discount** — enter a fixed amount or a percentage (F6 focuses the discount field). The discount is applied to the grand total and flows through to the ERPNext invoice as `discount_amount`.
- **Hold and recall draft bills** — press F3 to hold the current bill (saved in memory). Press `−` or Numpad − to open the recall list and resume any held bill. Multiple bills can be held simultaneously.
- **Customer search** — search by name or mobile number. The search results panel shows the customer's total outstanding receivable amount and individual overdue invoices with due dates, helping the cashier make credit decisions at the counter.
- **Gift Card / Voucher redemption** — enter a voucher serial number manually or use the autocomplete dropdown (searches ERPNext Serial No records with status `Delivered`). The voucher's denomination is auto-populated from the item name if it contains a numeric value. Expiry date is checked against today.
- **Credit (receivable) sales** — toggle F8 or the *Credit* button to switch the bill to credit mode. On confirmation a standard **Sales Invoice** (not a POS Invoice) is submitted to ERPNext, creating a customer receivable. A named customer other than Walk-in Customer is required.

#### Payment Processing

- Checkout screen opened with F12 or `+` / Numpad +.
- Payment rows are loaded from the POS Profile's payment methods.
- Cash amount auto-adjusts when non-cash payment amounts are entered to cover the remaining balance.
- Change-to-return overlay displayed for 3 seconds when the customer overpays with cash.
- **Offline queue** — if the ERPNext server is unreachable when the cashier confirms a cash/card sale, the invoice is saved to a local disk queue. The queue syncs automatically when connectivity is restored. A badge in the title bar shows the number of queued invoices.

#### Session Management

- On login the app checks ERPNext for an open POS Opening Entry matching the active POS Profile. If one is found it is restored; if none is found the cashier is prompted to open a new session with an opening cash amount.
- The current session is cached to disk so it can be restored when the app starts offline.
- **Sales Summary (F5)** — modal showing total sales, payment breakdown by mode, day cash collected vs opening cash (total cash in cashier), and category-wise sales breakdown. Close the POS session from this screen; a closing entry is submitted to ERPNext automatically.
- **Lock screen (Ctrl+L)** — blanks the display. Unlock by entering the cashier name or a PIN.

#### Offline Mode

- On first use (or after pressing F2) all items, item groups, and warehouse stock are downloaded and saved to disk with a 7-day TTL.
- Item details (prices, images, custom fields) are cached individually on first click and reused offline.
- Item search works offline via client-side filtering of the disk cache.
- The offline invoice queue stores the complete invoice payload and retries submission on reconnect.
- An online / offline indicator is shown in the title bar at all times.

#### Interface

- Dark UI by default with an optional light theme toggle.
- Cashier's full name (fetched from ERPNext User profile) shown in the title bar.
- *Hide Items* button collapses the item grid panel, giving the bill table the full screen width — useful on small touch screens.
- *Touch Mode* toggle enables the on-screen virtual keyboard (see below).

#### On-Screen Virtual Keyboard

- Full QWERTY keyboard layout rendered on-screen for touch-screen POS machines where a physical keyboard is not available.
- Includes a top row of F-key shortcuts (F1–F8, F12) matching the POS keyboard shortcut map.
- `+` and `−` shortcut keys are also present on the virtual keyboard for opening payment / recalling drafts.

#### Receipt Printing

- Silent receipt printing — no print dialog appears. The receipt is sent directly to the system's default printer using Electron's `webContents.print()` API.
- 80mm thermal-style HTML receipt layout with item lines, totals, payment breakdown, and change amount.
- Cash drawer kick — sends an ESC/POS drawer-open command over a COM or LPT port. Configure the port name in Settings.

#### ERPNext Integration

- **POS Invoice** used for all cash and card sales. Invoices are submitted via `frappe.client.submit` and linked to the open POS Opening Entry so Stock Ledger Entries are created immediately.
- **Sales Invoice** (non-POS) used for credit sales, creating a customer receivable.
- **POS Opening Entry** and **POS Closing Entry** managed by the app. The closing entry includes full payment reconciliation with opening amounts, expected amounts, and closing amounts per mode of payment.
- Supports ERPNext v14 and v15.

#### Installer

- NSIS Windows installer, x64 only.
- Installs to `C:\Program Files\ERPNext POS` by default; location is user-selectable.
- Creates Desktop and Start Menu shortcuts.
- Launches the application on finish.

---

### System Requirements

| Component | Minimum |
|---|---|
| Operating System | Windows 10 (64-bit), build 1903 or later |
| RAM | 4 GB |
| Disk space | 400 MB free |
| Display | 1280 × 720 |
| Network | LAN or internet connection to ERPNext server (offline mode available after first sync) |
| ERPNext | v14 or v15, accessible via HTTPS |
| Microsoft Visual C++ Redistributable | 2015–2022 x64 (installed automatically if missing on most systems) |

---

### ERPNext Setup Checklist

Before using the POS app, complete the following steps in ERPNext:

1. **Create a POS Profile** — link it to a warehouse and company. Add payment methods under the Payment Methods tab. Set a default customer (e.g. *Walk-in Customer*).
2. **Assign the POS Profile** to the ERPNext user account(s) who will log in.
3. **Configure Mode of Payment GL accounts** — for each Mode of Payment (Cash, Credit Card, Koko Payment, etc.) go to **Accounting → Mode of Payment**, open the record, and add a row in the Accounts table for your company with the correct GL debit account.
4. **Create Walk-in Customer** — a customer record named *Walk-in Customer* (or matching the *Customer* field on the POS Profile) must exist in ERPNext.
5. *(Optional)* **Gift Card GL account** — either set the `gift_card` custom field on the POS Profile, or configure it in the POS App Settings after logging in.
6. *(Optional)* **Custom price selling levels** — add the `custom_price_selling_levels` child table to the Item doctype if tiered pricing (Retail / Wholesale) is needed.
7. *(Optional)* **Email summary** — set the `custom_mail_id` field on the POS Profile to an email address to enable the email summary button in the Sales Summary screen.
