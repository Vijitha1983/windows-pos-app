// Serial Key Generator — ERPNext POS
// Run: node scripts/generate-serials.js
// Output: serials-pack-A.csv, serials-pack-B.csv, serials-pack-C.csv (100,000 each)
//
// Format: XXXXX-XXXXX-XXXXX-XXXXX
//   First 15 chars = unique ID (first char encodes pack)
//   Last  5 chars  = HMAC-SHA256 checksum
//
// Pack encoding via first character:
//   Pack A → first char in ABCDEFGH  (8 of 32 possible)
//   Pack B → first char in JKLMNPQR  (8 of 32 possible)
//   Pack C → first char in STUVWXYZ  (8 of 32 possible) + 23456789 fills gap

const crypto = require('crypto')
const fs     = require('fs')
const path   = require('path')

// Must match electron/license.js exactly
const SECRET  = 'ERPNEXT-POS-V2-LK-2026-X4R9M7'
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const PACK_FIRST_CHARS = {
  A: 'ABCDEFGH',
  B: 'JKLMNPQR',
  C: 'STUVWXYZ',
}

const PER_PACK = 100_000

function randomFrom(chars) {
  return chars[Math.floor(Math.random() * chars.length)]
}

function randomChar() {
  return CHARSET[Math.floor(Math.random() * CHARSET.length)]
}

function computeChecksum(id15) {
  return crypto
    .createHmac('sha256', SECRET)
    .update(id15)
    .digest('hex')
    .toUpperCase()
    .slice(0, 5)
}

function makeSerial(firstChar) {
  const rest = Array.from({ length: 14 }, randomChar).join('')
  const id   = firstChar + rest
  const check = computeChecksum(id)
  return `${id.slice(0,5)}-${id.slice(5,10)}-${id.slice(10,15)}-${check}`
}

const outDir = path.join(__dirname, '..')

for (const [pack, firstChars] of Object.entries(PACK_FIRST_CHARS)) {
  process.stdout.write(`Generating Pack ${pack} (${PER_PACK.toLocaleString()} serials)...`)
  const serials = new Set()
  while (serials.size < PER_PACK) {
    serials.add(makeSerial(randomFrom(firstChars)))
  }
  const lines  = ['Serial Key,Pack']
  for (const s of serials) lines.push(`${s},${pack}`)
  const file = path.join(outDir, `serials-pack-${pack}.csv`)
  fs.writeFileSync(file, lines.join('\n'), 'utf8')
  console.log(` done → ${file}`)
}

console.log(`\nTotal generated: ${(PER_PACK * 3).toLocaleString()} serials across 3 packs.`)
console.log('Distribute each CSV separately — do not publish them on GitHub.')
