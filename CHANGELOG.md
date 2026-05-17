# Orbis POS — Changelog

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
