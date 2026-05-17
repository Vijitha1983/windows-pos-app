/**
 * make-update.js
 *
 * Builds the renderer, packs app.asar via electron-builder --dir,
 * then creates a versioned zip ready to send to customers.
 *
 * Usage:  npm run make-update
 * Output: updates/Orbis-POS-Update-v{version}.zip
 */

const { execSync } = require('child_process')
const fs   = require('fs')
const path = require('path')

const ROOT    = path.join(__dirname, '..')
const pkg     = require(path.join(ROOT, 'package.json'))
const VERSION = pkg.version
const PRODUCT = pkg.productName || pkg.name  // "Orbis POS"
const OUT_DIR = path.join(ROOT, 'updates')

const ASAR_SRC = path.join(ROOT, 'release', 'win-unpacked', 'resources', 'app.asar')
const ASAR_DST = path.join(OUT_DIR, 'app.asar')
const BAT_DST  = path.join(OUT_DIR, 'install-update.bat')
const ZIP_NAME = `${PRODUCT.replace(/\s+/g, '-')}-Update-v${VERSION}.zip`
const ZIP_DST  = path.join(OUT_DIR, ZIP_NAME)

// ── helpers ────────────────────────────────────────────────────────
function step(label) { console.log(`\n\x1b[36m→\x1b[0m ${label}`) }
function ok(label)   { console.log(`  \x1b[32m✓\x1b[0m ${label}`) }
function fail(msg)   { console.error(`\n\x1b[31m✗ ${msg}\x1b[0m\n`); process.exit(1) }

function run(cmd, label) {
  step(label || cmd)
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' })
}

function mb(file) { return (fs.statSync(file).size / 1024 / 1024).toFixed(1) + ' MB' }

// ── 1. Build renderer ──────────────────────────────────────────────
run('npx vite build', 'Building renderer (Vite)...')

// ── 2. Pack app.asar via electron-builder --dir ───────────────────
run('npx electron-builder --dir --win', 'Packing app.asar (electron-builder --dir)...')

if (!fs.existsSync(ASAR_SRC)) {
  fail(`app.asar not found at expected path:\n  ${ASAR_SRC}`)
}

// ── 3. Prepare output folder ──────────────────────────────────────
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.copyFileSync(ASAR_SRC, ASAR_DST)
ok(`app.asar copied  (${mb(ASAR_DST)})`)

// ── 4. Write install-update.bat ───────────────────────────────────
step('Writing install-update.bat...')

// Searches %LOCALAPPDATA%, Program Files, Program Files (x86)
const bat = `@echo off
setlocal EnableDelayedExpansion
title ${PRODUCT} Update v${VERSION}

echo.
echo  ================================================
echo   ${PRODUCT}  ^|  Update v${VERSION}
echo  ================================================
echo.

:: Locate installation (user install or machine-wide install)
set INSTALL_DIR=
if exist "%LOCALAPPDATA%\\Programs\\${PRODUCT}\\resources\\app.asar" (
  set "INSTALL_DIR=%LOCALAPPDATA%\\Programs\\${PRODUCT}"
)
if not defined INSTALL_DIR if exist "%PROGRAMFILES%\\${PRODUCT}\\resources\\app.asar" (
  set "INSTALL_DIR=%PROGRAMFILES%\\${PRODUCT}"
)
if not defined INSTALL_DIR if exist "%PROGRAMFILES(X86)%\\${PRODUCT}\\resources\\app.asar" (
  set "INSTALL_DIR=%PROGRAMFILES(X86)%\\${PRODUCT}"
)

if not defined INSTALL_DIR (
  echo  ERROR: ${PRODUCT} installation not found.
  echo  Please make sure ${PRODUCT} is installed before running this update.
  echo.
  pause
  exit /b 1
)

echo  Installation found at:
echo    %INSTALL_DIR%
echo.

:: Close running app (ignore error if not running)
echo  Closing ${PRODUCT} if open...
taskkill /IM "${PRODUCT}.exe" /F >nul 2>&1
timeout /t 2 /nobreak >nul

:: Backup current app.asar
copy /Y "%INSTALL_DIR%\\resources\\app.asar" "%INSTALL_DIR%\\resources\\app.asar.bak" >nul
echo  Backup saved: app.asar.bak

:: Apply update
copy /Y "%~dp0app.asar" "%INSTALL_DIR%\\resources\\app.asar" >nul
if %errorlevel% neq 0 (
  echo.
  echo  ERROR: Could not write the update file.
  echo  Try right-clicking install-update.bat and choosing "Run as administrator".
  echo.
  pause
  exit /b 1
)

echo.
echo  ================================================
echo   Update v${VERSION} installed successfully!
echo   Launch ${PRODUCT} to start using the new version.
echo  ================================================
echo.
pause
`
fs.writeFileSync(BAT_DST, bat, 'utf8')
ok('install-update.bat written')

// ── 5. Zip with PowerShell Compress-Archive ───────────────────────
step(`Creating ${ZIP_NAME}...`)
if (fs.existsSync(ZIP_DST)) fs.unlinkSync(ZIP_DST)

// Write a temp .ps1 so path-with-spaces quoting is clean
const psScript = [
  `Set-Location '${OUT_DIR.replace(/'/g, "''")}'`,
  `Compress-Archive -Path 'app.asar','install-update.bat' -DestinationPath '${ZIP_DST.replace(/'/g, "''")}' -Force`,
].join('\r\n')

const psTmp = path.join(OUT_DIR, '_zip_tmp.ps1')
fs.writeFileSync(psTmp, psScript, 'utf8')

try {
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psTmp}"`, {
    cwd: ROOT, stdio: 'inherit',
  })
} finally {
  fs.unlinkSync(psTmp)
}

if (!fs.existsSync(ZIP_DST)) fail('Zip creation failed — PowerShell Compress-Archive did not produce output.')

ok(`Zip created  (${mb(ZIP_DST)})`)

// ── 6. Summary ────────────────────────────────────────────────────
console.log(`
\x1b[32m╔══════════════════════════════════════════════════════════╗
  Update package ready — v${VERSION}
  File : ${ZIP_NAME}
  Size : ${mb(ZIP_DST)}
  Path : ${OUT_DIR}
╚══════════════════════════════════════════════════════════╝\x1b[0m

Send \x1b[1m${ZIP_NAME}\x1b[0m to the customer.
Customer unzips it and double-clicks install-update.bat.
`)
