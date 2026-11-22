// Startet die gebaute App, navigiert durch die Seiten und speichert Screenshots.
// Löst KEINE Downloads aus. Aufruf: node scripts/smoke.mjs <screenshot-dir> [route ...]
import { _electron as electron } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const outDir = process.argv[2] ?? 'smoke-out'
const routes = process.argv.slice(3).length ? process.argv.slice(3) : ['/', '/browse', '/explore', '/artists', '/settings', '/library', '/downloads']
mkdirSync(outDir, { recursive: true })
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env, executablePath: 'node_modules/electron/dist/electron' })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await win.setViewportSize({ width: 1400, height: 880 }).catch(() => {})
await win.waitForSelector('.sidebar', { timeout: 30000 })
for (const r of routes) {
  await win.evaluate((h) => { location.hash = h }, r)
  await win.waitForTimeout(3500)
  const name = r.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') || 'home'
  await win.screenshot({ path: join(outDir, `${name}.png`) })
  console.log('shot', r)
}
if (process.env.SMOKE_PLAY) {
  await win.evaluate(() => { location.hash = '/release/001b48d9-16d6-4790-a816-9de66a43cd80' })
  await win.waitForSelector('.tr:not(.head)', { timeout: 20000 })
  await win.dblclick('.tr:not(.head) >> nth=0')
  await win.waitForTimeout(6000)
  const state = await win.evaluate(() => ({
    title: document.querySelector('.pb-title')?.textContent,
    source: document.querySelector('.src-badge')?.textContent,
    times: [...document.querySelectorAll('.pb-progress .time')].map((e) => e.textContent)
  }))
  console.log('PLAYBACK', JSON.stringify(state))
  await win.screenshot({ path: join(outDir, 'playback.png') })
}
console.log('ERRORS', JSON.stringify(errors.slice(0, 20), null, 1))
await app.close()
