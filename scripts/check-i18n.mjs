// Schaltet die Sprache über die Einstellungen um und prüft alle Seiten auf rohe Übersetzungsschlüssel.
import { _electron as electron } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
const out = process.argv[2] ?? 'i18n-out'
mkdirSync(out, { recursive: true })
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env, executablePath: 'node_modules/electron/dist/electron' })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
win.on('console', (m) => { if (m.type() === 'error' || /i18next/i.test(m.text())) errors.push(m.text().slice(0, 160)) })
await win.setViewportSize({ width: 1400, height: 880 }).catch(() => {})
await win.waitForSelector('.sidebar')
const go = async (h, ms = 3000) => { await win.evaluate((x) => { location.hash = x }, h); await win.waitForTimeout(ms) }
const rawKeys = () => win.evaluate(() => {
  const found = new Set()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const s = walker.currentNode.textContent.trim()
    if (/^[a-z][a-zA-Z]+(\.[a-zA-Z_${}]+)+$/.test(s) && !/\.(com|jpg|flac|mp3|wav)$/.test(s)) found.add(s)
  }
  for (const el of document.querySelectorAll('[title],[aria-label],[placeholder]')) {
    for (const a of ['title', 'aria-label', 'placeholder']) {
      const v = el.getAttribute(a)
      if (v && /^[a-z][a-zA-Z]+(\.[a-zA-Z_]+)+$/.test(v)) found.add(`${a}=${v}`)
    }
  }
  return [...found]
})
const routes = ['/', '/browse', '/explore', '/search?q=feint', '/artists', '/artist/shingo-nakamura', '/release/001b48d9-16d6-4790-a816-9de66a43cd80', '/track/53088d3f-f0d7-4c6a-8eed-c5eff39164ae', '/playlists', '/favorites', '/downloads/library', '/downloads', '/settings']
for (const lang of ['en', 'de']) {
  await go('/settings', 2000)
  await win.selectOption('.settings select.select >> nth=0', lang)
  await win.waitForTimeout(1000)
  const htmlLang = await win.evaluate(() => document.documentElement.lang)
  const navHome = await win.textContent('.nav-item >> nth=0')
  console.log(`[${lang}] html lang=${htmlLang} nav[0]="${navHome.trim()}"`)
  for (const r of routes) {
    await go(r, r.startsWith('/search') || r.startsWith('/track') ? 4500 : 3000)
    const raw = await rawKeys()
    if (raw.length) console.log(`  RAW KEYS on ${r}:`, JSON.stringify(raw))
    if (['/', '/browse', '/settings', '/track/53088d3f-f0d7-4c6a-8eed-c5eff39164ae', '/downloads'].includes(r)) {
      await win.screenshot({ path: join(out, `${lang}_${r.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') || 'home'}.png`) })
    }
  }
  // Dialog + Menüs
  await go('/browse', 3000)
  await win.click('.tracktable .tr:not(.head) .td.status-cell .icon-btn >> nth=-1')
  await win.waitForTimeout(400)
  console.log(`  [${lang}] Zeilenmenü:`, JSON.stringify(await win.$$eval('.row-menu .menu-item', (els) => els.slice(0, 4).map((e) => e.textContent.trim()))))
  await win.keyboard.press('Escape')
}
// zurück auf Systemsprache
await go('/settings', 1500)
await win.selectOption('.settings select.select >> nth=0', 'system')
await win.waitForTimeout(800)
console.log('system →', await win.evaluate(() => document.documentElement.lang), '(navigator:', await win.evaluate(() => navigator.languages.join(',')), ')')
console.log('ERRORS', JSON.stringify(errors.slice(0, 10)))
await app.close()
