// Testet das Herz in der Player-Leiste: hinzufügen → bei SoundScout prüfen → wieder entfernen → prüfen.
// Bricht ab (ohne Änderung), falls der Testtrack bereits Favorit ist.
import { _electron as electron } from 'playwright-core'
const TRACK = '53088d3f-f0d7-4c6a-8eed-c5eff39164ae'
const RELEASE = '001b48d9-16d6-4790-a816-9de66a43cd80'
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env, executablePath: 'node_modules/electron/dist/electron' })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.setViewportSize({ width: 1400, height: 880 }).catch(() => {})
await win.waitForSelector('.sidebar')
await win.waitForTimeout(3000)
const isFav = () => win.evaluate(async (id) => {
  const pl = await window.ss.api.get('/me/library')
  for (let o = 0; o < 5000; o += 50) {
    const r = await window.ss.api.get(`/playlist/${pl.ID}/tracks`, { limit: 50, offset: o })
    if ((r.Data ?? []).some((x) => x.TrackID === id)) return true
    if ((r.Data ?? []).length < 50) return false
  }
  return false
}, TRACK)
if (await isFav()) { console.log('ABORT: Testtrack ist bereits Favorit – keine Änderung'); await app.close(); process.exit(0) }
await win.evaluate((h) => { location.hash = h }, `/release/${RELEASE}`)
await win.waitForSelector('.tr:not(.head)')
await win.dblclick('.tr:not(.head) >> nth=0')
await win.waitForTimeout(2500)
await win.click('.play-btn:not(.big)') // pausieren
const btn = '.pb-left .fav'
console.log('Herz vorher an?', await win.$eval(btn, (b) => b.classList.contains('on')))
await win.click(btn)
await win.waitForTimeout(2500)
console.log('Herz nach Klick an?', await win.$eval(btn, (b) => b.classList.contains('on')), '| Zeile in Tabelle an?', await win.$eval('.tr:not(.head) >> nth=0', (r) => r.querySelector('.fav')?.classList.contains('on')))
console.log('Bei SoundScout Favorit?', await isFav())
await win.screenshot({ path: process.argv[2] })
await win.click(btn)
await win.waitForTimeout(2500)
console.log('Herz nach 2. Klick an?', await win.$eval(btn, (b) => b.classList.contains('on')))
console.log('Bei SoundScout Favorit (nach Entfernen)?', await isFav())
console.log('ERRORS', JSON.stringify(errors))
await app.close()
