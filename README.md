# ERPNext POS — Desktop Application

A standalone Windows POS terminal built with **Electron + React + Tailwind CSS**, connecting to an ERPNext instance via REST API.

## Prerequisites

- Node.js 18+ (download from nodejs.org)
- An ERPNext instance (v14 or v15) with POS Profiles configured
- The `custom_price_selling_levels` child table added to the Item doctype in ERPNext

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

The installer will be at `release/ERPNext POS Setup x.x.x.exe`.

## ERPNext Configuration Required

### 1. Custom Price Selling Levels (Item Child Table)
Add a child table `custom_price_selling_levels` to the **Item** doctype with these fields:
| Field Name       | Field Type | Label        |
|------------------|------------|--------------|
| level            | Data       | Level        |
| marked_price     | Currency   | Marked Price |
| discount_amount  | Currency   | Discount     |
| our_price        | Currency   | Our Price    |
| active           | Check      | Active       |

### 2. POS Profile
- Create at least one POS Profile linked to a warehouse and company
- Add payment methods (Cash, Card, etc.)
- Assign to the user logging in

### 3. Walk-in Customer
- Create a customer named **"Walk-in Customer"** in ERPNext
- This is used when no specific customer is selected at checkout

## Keyboard Shortcuts

| Key      | Action               |
|----------|----------------------|
| F1       | New Bill / Focus Search |
| F2       | Hold Bill            |
| F3       | Recall Bill          |
| F4       | Cancel Bill          |
| F12      | Open Payment Screen  |
| Ctrl+F   | Focus Search Bar     |
| Arrow Keys | Navigate Item Grid / Bill |
| Enter    | Select / Confirm     |
| ESC      | Cancel / Close Modal |
| C        | Select Cash (in payment) |
| D        | Select Card (in payment) |
| Delete   | Remove selected bill row |

## Features

- **Login** with ERPNext credentials + POS Profile selection
- **Item Grid** with category tabs, search, and optional image display
- **Custom Price Levels** — reads `custom_price_selling_levels` from each Item
  - 0 levels → standard rate
  - 1 level → auto-applied
  - 2+ levels → selection popup
- **Bill Management** — add, edit qty, remove items; hold/recall bills
- **Discount** — amount or percentage at bill level
- **Payment Screen** — multiple payment methods from POS Profile, auto-change calculation
- **Offline Queue** — invoices saved locally when ERPNext is unreachable, retry on reconnect
- **Barcode Scanner** — fast input auto-searches and adds single-match items
- **Settings** — URL, POS profile, image toggle, cache clear

## Project Structure

```
pos-app/
├── electron/
│   ├── main.js          Electron main process + window controls
│   └── preload.js       IPC bridge (electron-store access)
├── src/
│   ├── components/
│   │   ├── Login.jsx
│   │   ├── POSMain.jsx      Main layout (split panel)
│   │   ├── ItemGrid.jsx     Left panel: search + categories + items
│   │   ├── BillTable.jsx    Right panel: current bill + totals + actions
│   │   ├── PaymentModal.jsx F12 payment screen
│   │   ├── PriceLevelModal.jsx  Price level selection popup
│   │   ├── QtyModal.jsx     Qty + price dialog
│   │   └── Settings.jsx
│   ├── services/
│   │   ├── api.js       ERPNext REST API calls (Axios, cookie auth)
│   │   ├── auth.js      Login / session restore / logout
│   │   └── cache.js     5-min memory cache + offline invoice queue
│   ├── store/
│   │   └── posStore.js  Zustand global state
│   ├── hooks/
│   │   └── useKeyboard.js
│   └── App.jsx
├── package.json
├── vite.config.js
├── tailwind.config.js
└── electron-builder.yml
```
