// Generates release/RELEASE-NOTES.pdf from RELEASE-NOTES.md using Edge headless.
// Usage: node scripts/generate-release-pdf.js

const fs   = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const os   = require('os')

const ROOT    = path.join(__dirname, '..')
const MD_FILE = path.join(ROOT, 'RELEASE-NOTES.md')
const OUT_PDF = path.join(ROOT, 'release', 'ERPNext POS — Release Notes.pdf')
const TMP_HTML = path.join(os.tmpdir(), 'erpnext-pos-release-notes.html')

const md = fs.readFileSync(MD_FILE, 'utf8')

// ── Minimal Markdown → HTML (handles the subset used in RELEASE-NOTES.md) ──
function mdToHtml(text) {
  const lines = text.split('\n')
  const out = []
  let inList = false

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    // Close list before non-list line
    const isList = /^(\s*-\s|\s*\d+\.\s)/.test(line)
    if (inList && !isList && line.trim() !== '') { out.push('</ul>'); inList = false }

    // HR
    if (/^---+$/.test(line.trim())) { out.push('<hr>'); continue }

    // Headings
    if (/^#### /.test(line)) { out.push(`<h4>${inline(line.slice(5))}</h4>`); continue }
    if (/^### /.test(line))  { out.push(`<h3>${inline(line.slice(4))}</h3>`); continue }
    if (/^## /.test(line))   { out.push(`<h2>${inline(line.slice(3))}</h2>`); continue }
    if (/^# /.test(line))    { out.push(`<h1>${inline(line.slice(2))}</h1>`); continue }

    // Ordered list item
    if (/^\s*\d+\.\s/.test(line)) {
      if (!inList) { out.push('<ol>'); inList = true; /* switch tag */ }
      out.push(`<li>${inline(line.replace(/^\s*\d+\.\s/, ''))}</li>`)
      continue
    }

    // Unordered list item
    if (/^\s*-\s/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${inline(line.replace(/^\s*-\s/, ''))}</li>`)
      continue
    }

    // Blank line
    if (line.trim() === '') { out.push(''); continue }

    // Paragraph
    out.push(`<p>${inline(line)}</p>`)
  }
  if (inList) out.push('</ul>')
  return out.join('\n')
}

function inline(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

const body = mdToHtml(md)

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ERPNext POS — Release Notes</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 11pt;
    color: #1a1a2e;
    line-height: 1.6;
    background: #fff;
    padding: 40px 52px;
    max-width: 780px;
    margin: 0 auto;
  }

  /* Cover header */
  .cover {
    background: linear-gradient(135deg, #1e3a5f 0%, #2563a8 100%);
    color: #fff;
    border-radius: 10px;
    padding: 36px 40px 32px;
    margin-bottom: 36px;
  }
  .cover-title {
    font-size: 24pt;
    font-weight: 700;
    letter-spacing: -0.5px;
    margin-bottom: 6px;
  }
  .cover-sub {
    font-size: 11pt;
    opacity: 0.75;
    margin-bottom: 16px;
  }
  .cover-badge {
    display: inline-block;
    background: rgba(255,255,255,0.18);
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 20px;
    padding: 4px 14px;
    font-size: 9.5pt;
    font-weight: 600;
    letter-spacing: 0.3px;
    margin-right: 8px;
  }

  h1 { display: none; }  /* covered by .cover */

  h2 {
    font-size: 16pt;
    font-weight: 700;
    color: #1e3a5f;
    margin-top: 32px;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 2px solid #2563a8;
  }

  h3 {
    font-size: 12pt;
    font-weight: 700;
    color: #2563a8;
    margin-top: 20px;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 9.5pt;
  }

  h4 {
    font-size: 11pt;
    font-weight: 700;
    color: #1a1a2e;
    margin-top: 14px;
    margin-bottom: 4px;
  }

  p { margin-bottom: 8px; color: #333; }

  ul, ol {
    margin: 6px 0 10px 22px;
    color: #333;
  }
  li { margin-bottom: 4px; }
  li::marker { color: #2563a8; }

  code {
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 9.5pt;
    background: #eef2ff;
    color: #1e40af;
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid #c7d2fe;
  }

  strong { color: #1a1a2e; }

  hr {
    border: none;
    border-top: 1px solid #e5e7eb;
    margin: 28px 0;
  }

  .footer {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
    font-size: 9pt;
    color: #9ca3af;
    text-align: center;
  }

  @page {
    margin: 20mm 18mm;
    size: A4;
  }
  @media print {
    body { padding: 0; }
    .cover { break-inside: avoid; }
    h2 { break-before: auto; }
  }
</style>
</head>
<body>

<div class="cover">
  <div class="cover-title">ERPNext POS</div>
  <div class="cover-sub">Windows Desktop POS Application</div>
  <span class="cover-badge">Release Notes</span>
  <span class="cover-badge">v1.2.0 · v1.1.0 · v1.0.0</span>
</div>

${body}

<div class="footer">
  Copyright &copy; 2025 Vijitha Rajapaksha &nbsp;&middot;&nbsp; All rights reserved
  &nbsp;&middot;&nbsp; Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
</div>

</body>
</html>`

fs.writeFileSync(TMP_HTML, html, 'utf8')
console.log('HTML written →', TMP_HTML)

// Locate Edge or Chrome
const browsers = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]
const browser = browsers.find((b) => fs.existsSync(b))
if (!browser) {
  console.error('No headless browser found (Edge / Chrome). Install one and retry.')
  process.exit(1)
}

const fileUrl = 'file:///' + TMP_HTML.replace(/\\/g, '/')
const cmd = `"${browser}" --headless --disable-gpu --no-sandbox --print-to-pdf="${OUT_PDF}" --print-to-pdf-no-header "${fileUrl}"`

console.log('Rendering PDF via', path.basename(browser), '…')
try {
  execSync(cmd, { stdio: 'inherit' })
  fs.unlinkSync(TMP_HTML)
  console.log('PDF written →', OUT_PDF)
} catch (e) {
  console.error('PDF render failed:', e.message)
  process.exit(1)
}
