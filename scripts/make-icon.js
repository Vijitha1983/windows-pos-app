// Converts public/logo-source.png → public/icon.ico
const { default: pngToIco } = require('png-to-ico')
const fs = require('fs')
const path = require('path')

const src  = path.resolve(__dirname, '..', 'public', 'logo-source.png')
const dest = path.resolve(__dirname, '..', 'public', 'icon.ico')
const dist = path.resolve(__dirname, '..', 'dist', 'icon.ico')

if (!fs.existsSync(src)) {
  console.error('\nERROR: public/logo-source.png not found.')
  console.error('Save the logo PNG as public/logo-source.png and run again.\n')
  process.exit(1)
}

pngToIco(src)
  .then((buf) => {
    fs.writeFileSync(dest, buf)
    if (fs.existsSync(path.dirname(dist))) fs.writeFileSync(dist, buf)
    console.log('Icon written → public/icon.ico')
  })
  .catch((err) => {
    console.error('Conversion failed:', err.message)
    process.exit(1)
  })
