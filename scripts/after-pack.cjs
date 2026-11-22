// electron-builder afterPack: setzt Icon und Versionsinfos der Windows-.exe mit rcedit.
// Unter WSL wird rcedit (Windows-Programm) über die Interop direkt ausgeführt – kein wine nötig.
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const exe = join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const ico = join(context.packager.info.projectDir, 'resources', 'icon.ico')
  const rcedit = join(context.packager.info.projectDir, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe')
  const isWsl = process.platform === 'linux' && !!process.env.WSL_DISTRO_NAME
  const win = (p) => (isWsl ? execFileSync('wslpath', ['-w', p]).toString().trim() : p)
  const { version, productName } = context.packager.appInfo
  try {
    if (process.platform !== 'win32' && !isWsl) throw new Error('rcedit benötigt Windows oder WSL')
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    execFileSync(rcedit, [
      win(exe),
      '--set-icon', win(ico),
      '--set-version-string', 'ProductName', productName,
      '--set-version-string', 'FileDescription', productName,
      '--set-version-string', 'CompanyName', productName,
      '--set-version-string', 'LegalCopyright', 'Inoffizieller Client für SoundScout',
      '--set-file-version', version,
      '--set-product-version', version
    ], { stdio: 'inherit', env })
    console.log(`  • rcedit: Icon und Versionsinfos gesetzt (${exe})`)
  } catch (e) {
    console.warn(`  • rcedit übersprungen: ${e.message}`)
  }
}
