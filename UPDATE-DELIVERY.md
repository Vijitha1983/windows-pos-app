# Orbis POS — Customer Update Delivery Guide

## Overview

When a new feature or bug fix is ready, you do NOT need to send the customer a full reinstaller.
All app code (renderer + electron main) is packed into a single file: **app.asar** (~3–5 MB).
Replacing this one file updates the app completely.

---

## How to build an update package

```
npm run make-update
```

This command does the following automatically:
1. Builds the React renderer via Vite
2. Packs everything into `app.asar` via electron-builder
3. Creates `updates/install-update.bat` (the installer script for the customer)
4. Zips both files as `updates/Orbis-POS-Update-v{version}.zip`

**Output:** `updates/Orbis-POS-Update-v1.x.x.zip`

---

## What to send the customer

Send the customer this single zip file:

```
Orbis-POS-Update-v1.x.x.zip
  ├── app.asar              ← new app code
  └── install-update.bat    ← customer runs this
```

File size is typically **3–6 MB** (vs 80+ MB for a full installer).

---

## What the customer does

1. Download and unzip the file
2. Double-click `install-update.bat`
3. The script will:
   - Automatically find the Orbis POS installation (checks user and machine-wide locations)
   - Close the running app if open
   - Back up the old `app.asar` as `app.asar.bak`
   - Copy in the new `app.asar`
4. Customer launches Orbis POS — update is live

If the script says "permission denied", right-click → **Run as administrator**.

---

## What gets updated by app.asar replacement

| Change type                            | Covered? |
|----------------------------------------|----------|
| New UI screens / components            | ✅ Yes   |
| New features / workflows               | ✅ Yes   |
| Bug fixes                              | ✅ Yes   |
| New ERPNext API integrations           | ✅ Yes   |
| New keyboard shortcuts                 | ✅ Yes   |
| New npm packages (pure JS)             | ✅ Yes   |
| New Electron IPC handlers              | ✅ Yes   |
| Electron version upgrade               | ❌ No — full installer needed |
| New native npm modules (.node files)   | ❌ No — full installer needed |
| New Windows shortcuts / registry keys  | ❌ No — full installer needed |

For your current stack (React + Zustand + Axios — no native modules), you will rarely
need a full installer. Most updates ship as app.asar only.

---

## Version bump checklist before building update

1. Update version in `package.json`
2. Add entry to `CHANGELOG.md`
3. Commit with message: `fix:` or `feat:` depending on change type
4. Run `npm run make-update`
5. Send zip to customer

---

## Rollback

If a customer reports a problem after updating, they can roll back:

1. Navigate to:  `%LOCALAPPDATA%\Programs\Orbis POS\resources\`
2. Rename `app.asar` to `app.asar.bad`
3. Rename `app.asar.bak` to `app.asar`
4. Restart Orbis POS

The install script always keeps a `.bak` of the previous version.

---

## When you DO need to send a full installer

- First installation on a new customer machine (always needs the installer)
- Electron version upgrade (once or twice a year for security updates)
- If you ever add a native Node module (unlikely for this project)

Full installer build:  `npm run dist`
Output: `release/Orbis-POS-Setup-{version}.exe`
