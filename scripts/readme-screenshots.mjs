// Erzeugt die README-Screenshots (englische Oberfläche) mit einem separaten Datenordner.
// Private Angaben werden vor jedem Bild ersetzt: Abo-Name, lokale Pfade; Discord zeigt einen simulierten Nutzer.
//
//   CRATE_RANGER_USER_DATA=/pfad/zum/demo-ordner node scripts/readme-screenshots.mjs docs/screenshots
//
// Der Demo-Ordner sollte eine angemeldete Sitzung und Demo-Hördaten (stats/plays.jsonl) enthalten.
// Es werden KEINE Downloads ausgelöst.
import { _electron as electron } from 'playwright-core'
import { createServer } from 'node:net'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = process.argv[2] ?? 'docs/screenshots'
const PLAN = process.env.DEMO_PLAN ?? 'Creator Plan - Monthly'
const DEMO_PATH = 'C:\\Users\\you\\Music\\SoundScout'
const DEMO_RESET = 'Resets on 1/1/2027'
const RELEASE = '0f9a9720-e474-49d5-a5d0-4a833bf62353' // Alan Walker – Neon Nights (EP)
if (!process.env.CRATE_RANGER_USER_DATA) throw new Error('CRATE_RANGER_USER_DATA muss auf einen Demo-Datenordner zeigen')
mkdirSync(OUT, { recursive: true })

// Simulierter Discord-Client (kein echtes Konto)
const runtime = mkdtempSync(join(tmpdir(), 'demo-discord-'))
const discord = createServer((sock) => {
  let buf = Buffer.alloc(0)
  sock.on('data', (c) => {
    buf = Buffer.concat([buf, c])
    while (buf.length >= 8 && buf.length >= 8 + buf.readUInt32LE(4)) {
      const op = buf.readUInt32LE(0)
      buf = buf.subarray(8 + buf.readUInt32LE(4))
      if (op === 0) {
        const body = Buffer.from(JSON.stringify({ cmd: 'DISPATCH', evt: 'READY', data: { user: { id: '0', username: 'ranger', global_name: 'Ranger' } } }))
        const h = Buffer.alloc(8)
        h.writeUInt32LE(1, 0)
        h.writeUInt32LE(body.length, 4)
        sock.write(Buffer.concat([h, body]))
      }
    }
  })
})
await new Promise((r) => discord.listen(join(runtime, 'discord-ipc-0'), r))

const env = { ...process.env, XDG_RUNTIME_DIR: runtime }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env, executablePath: 'node_modules/electron/dist/electron' })
const win = await app.firstWindow()
await win.setViewportSize({ width: 1440, height: 900 })
await win.waitForSelector('.sidebar')
const realRoot = (await win.evaluate(() => window.ss.settings.get())).downloadRoot

/**
 * Ersetzt private Angaben im sichtbaren DOM: Abo-Name, Abo-Laufzeit/Reset-Datum und lokale Pfade.
 * Arbeitet über die Elemente (nicht über bestimmte Plan-Namen), damit das Skript selbst nichts verrät.
 */
async function scrub() {
  await win.evaluate(({ plan, realRoot, demoPath, reset }) => {
    for (const el of document.querySelectorAll('.account-plan')) el.textContent = plan
    for (const el of document.querySelectorAll('.quota-sub')) el.textContent = reset
    for (const row of document.querySelectorAll('.kv')) {
      const [label, value] = row.children
      if (!value) continue
      if (label.textContent === 'Plan') value.textContent = plan
      if (label.textContent === 'Subscription') value.textContent = 'active'
    }
    const fix = (s) => (realRoot ? s.split(realRoot).join(demoPath) : s)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const n = walker.currentNode
      const v = fix(n.textContent)
      if (v !== n.textContent) n.textContent = v
    }
    for (const el of document.querySelectorAll('input, [title]')) {
      if (el.value) el.value = fix(el.value)
      if (el.title) el.title = fix(el.title)
    }
  }, { plan: PLAN, realRoot, demoPath: DEMO_PATH, reset: DEMO_RESET })
}

const go = async (hash, ms = 3500) => {
  await win.evaluate((h) => { location.hash = h }, hash)
  await win.waitForTimeout(ms)
}
const main = win.locator('main.main')
async function shot(name, { scrollTo = 0 } = {}) {
  await main.evaluate((m, y) => m.scrollTo(0, y), scrollTo)
  await win.mouse.move(1430, 890)
  await win.waitForTimeout(600)
  await scrub()
  await win.screenshot({ path: join(OUT, `${name}.png`) })
  console.log('📸', name)
}

// Englisch, Discord-Status an
// Keine Update-Nachfrage im Bild (und keine Anfrage an GitHub); „Endlos hören“ sichtbar eingeschaltet
await win.evaluate(() => window.ss.settings.set({ language: 'en', discordEnabled: true, updateCheck: false, autoplay: true }))
await go('/settings', 800)
await win.selectOption('.settings select.select >> nth=0', 'en')
await win.waitForTimeout(500)

// 1) Start mit laufendem Track (danach pausiert, Fortschritt in der Mitte)
await go('/', 4000)
await win.dblclick('.tracktable .tr:not(.head) >> nth=0')
await win.waitForTimeout(6000)
await win.evaluate(() => {
  const el = document.querySelector('.pb-progress .slider')
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  set.call(el, String(Number(el.max) * 0.42))
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await win.waitForTimeout(1500)
await win.click('.play-btn:not(.big)') // Pause
await shot('home')

// 2) Release mit Hover-Play auf „Mehr von …“
await go(`/release/${RELEASE}`, 4000)
await shot('release')

// 3) Katalog mit geöffnetem Genre-Filter
await go('/browse?genres=5547a04e-2a04-4cc1-a1ab-7ddf54af2270&title=Drum%20%26%20Bass', 4000)
await win.click('.filter-bar .chip >> nth=0')
await win.waitForTimeout(800)
await shot('catalog')

// 4) Track-Seite
const trackId = await win.evaluate(() => document.querySelector('.tracktable .tr:not(.head) .t a')?.getAttribute('href')?.split('/').pop())
await go(`/release/${RELEASE}`, 2500)
const firstTrack = await win.evaluate(() => document.querySelector('.tracktable .tr:not(.head) .t a')?.getAttribute('href'))
await go(firstTrack ?? `/track/${trackId}`, 5000)
await shot('track')

// 5) Entdecken
await go('/explore', 4000)
await shot('explore')

// 6) Field Report
await go('/field-report', 5000)
await shot('field-report')
const chartsTop = await main.evaluate((m) => {
  const card = [...m.querySelectorAll('.chart-card')].find((c) => c.querySelector('svg'))
  return card ? card.getBoundingClientRect().top - m.getBoundingClientRect().top + m.scrollTop - 24 : 1100
})
await shot('field-report-charts', { scrollTo: chartsTop })

// 7) Story (Top-Artist-Folie)
await main.evaluate((m) => m.scrollTo(0, 0))
await win.click('.report-controls .btn-primary')
await win.waitForTimeout(800)
await win.keyboard.press('ArrowRight')
await win.keyboard.press('ArrowRight')
await win.keyboard.press('Space') // anhalten
await win.waitForTimeout(1200)
await scrub()
await win.screenshot({ path: join(OUT, 'story.png') })
console.log('📸 story')
await win.keyboard.press('Escape')

// 8) Einstellungen (Sprache, Discord, Downloads)
await go('/settings', 2500)
await shot('settings', { scrollTo: 0 })

await win.evaluate(() => window.ss.settings.set({ language: 'system' }))
await app.close()
discord.close()
