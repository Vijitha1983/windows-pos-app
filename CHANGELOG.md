# Orbis POS — Changelog

## [1.3.8] — 2026-05-17

### New Features

#### Tax Calculation on POS Invoices
- POS invoices now correctly carry tax when submitted to ERPNext.
- Three-tier tax resolution priority:
  1. **Tax Rule lookup** — if the customer (or POS Profile) has a `tax_category`, the matching ERPNext Tax Rule is fetched and its Sales Tax Template applied.
  2. **POS Profile taxes fallback** — if no Tax Rule matches, taxes configured directly on the POS Profile are used.
  3. **Item Tax Template** — each invoice line carries `item_tax_template` fetched from the ERPNext Item Tax child table, enabling India GST item-level compliance.
- `getApplicableTaxes(company, taxCategory)` added to `api.js` — queries Tax Rule doctype, fetches the resolved Sales Taxes and Charges Template.
- `getItemTaxTemplates(itemCodes)` added to `api.js` — batch-fetches item-level tax templates for all items in the bill.
- Tax resolution runs before invoice submission; offline queue fallback also includes taxes.

#### Touch Mode — Function Buttons Always Active
- The F-key toolbar (F1–F12) is now permanently visible at the bottom of the screen whenever Touch Mode is enabled, even when no input field is focused.
- F1 (New Bill) now fires correctly from the virtual keyboard even when an input field has focus (removed `!inInput` guard).
- F6 (Discount) now focuses the discount field even when triggered from the virtual keyboard while another input is active.
- Main layout adds bottom padding (`pb-14`) in touch mode so the permanent F-key bar never overlaps content.
- Virtual keyboard completely rewritten: permanent `FKeyBar` component renders at `z-[100]`; full keyboard at `z-[200]` when an input is focused.

#### Customer Update Delivery System
- New `npm run make-update` script — builds `app.asar` and packages it as a versioned zip (`Orbis-POS-Update-v{version}.zip`) ready to send to customers.
- Customers receive a ~4 MB zip instead of an 80+ MB installer for every update.
- Bundled `install-update.bat` auto-detects the installation location (user-level `%LOCALAPPDATA%` or machine-wide `%PROGRAMFILES%`), backs up the previous `app.asar`, and applies the update.
- `UPDATE-DELIVERY.md` added to the project — full developer guide covering the build workflow, what app.asar covers, version bump checklist, customer rollback instructions, and when a full installer is required.

### Improvements
- `getCustomers` API call now fetches `tax_category` field so customer tax categories are available at checkout.
- `updates/` folder added to `.gitignore` — built update packages are never accidentally committed.

---

## [1.3.7] — 2026-05-17

### New Features

#### Promotional Schemes (Auto-Apply from ERPNext)
- Automatically fetch active ERPNext Promotional Schemes on login and F2 Sync
- **Price Discount**: When item quantity reaches a configured slab threshold, unit price is automatically updated to the promotional rate. Original list price is shown crossed-out in amber with the promotional price displayed alongside a PROMO badge.
- **Product Discount (Free Item)**: When item quantity reaches a configured slab threshold, a free item row is automatically inserted below the parent item. Supports `same_item=1` (free unit of the same purchased item) and separate free item codes.
- Free item rows display a FREE badge, quantity from ERPNext slab, zero price, and are locked (cannot be manually edited or removed independently).
- Removing a parent item also removes its linked free row automatically.
- Held bills (recalled from draft) retain backward compatibility via `basePrice` fallback.
- Promo schemes are cached to disk and restored on startup for offline use.
- Header badge shows active promo count with scheme names on hover.
- Promo schemes matched per item code or item group as configured in ERPNext (`items` child table). Empty items table = applies to all items.

#### Keyboard Shortcut — F10 Return
- Added `F10` as a global keyboard shortcut to open the Return / Exchange modal.
- Return button in the bill header now shows the `F10` hint label.
- F10 is blocked when other modals (payment, item dialog, etc.) are already open.

#### Default Customer from POS Profile
- The customer search field now shows the POS Profile's configured default customer name (e.g. "Cash Customer", "Walk-in") instead of the hardcoded "Walk-in Customer" text.
- Credit sale validation also uses the POS Profile's customer as the exclusion reference.

### Branding
- App rebranded to **Orbis POS** by Infotop.
- Login screen title updated to "Orbis POS"; customer's company name shown as subtitle after login.
- Window title, taskbar name, installer product name, and desktop shortcut all updated to "Orbis POS".
- Copyright updated to Infotop.

### Improvements
- ERPNext URL field on login screen pre-filled with `https://` so users type only the domain.
- Invoice builder strips `[FREE]` suffix from item names before submitting to ERPNext, ensuring clean item names in Sales Invoices and POS Invoices.
- Free item rows are included in the invoice payload with `qty` and `rate: 0` so ERPNext correctly deducts stock for promotional free items.
- Price promotional rate is sent as the invoice line `rate` — the promotional price becomes the official unit price in ERPNext.

---

## [1.3.6] — 2026-05-16

- Fix: bump to 1.3.6; fix `getCategoryWiseSales` to fetch full invoice docs.

## [1.3.5] — 2026-05-15

- Fix: setup screen defaults to Start Free Trial tab, match tab styling to design.

## [1.3.4] — 2026-05-14

- Fix: bypass license check in dev mode; fix exchange flow in ReturnTab.

## [1.3.3] — 2026-05-13

- Fix: add parenttype filter to `getCategoryWiseSales`, add debug logging.

## [1.3.2] — 2026-05-12

- Fix: restore Category Wise Sales, show returns as clear deduction in Cashier Summary.
