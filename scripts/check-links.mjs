// Klickt Titel-, Artist- und Release-Links in der gebauten App und prüft die Ziel-Routen. Keine Downloads.
import { _electron as electron } from 'playwright-core'
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env, executablePath: 'node_modules/electron/dist/electron' })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
await win.setViewportSize({ width: 1400, height: 880 }).catch(() => {})
await win.waitForSelector('.sidebar')
const go = async (h, ms = 3500) => { await win.evaluate((x) => { location.hash = x }, h); await win.waitForTimeout(ms) }
const route = () => win.evaluate(() => location.hash)
const check = async (name, fn) => { try { await fn(); console.log('OK  ', name, '→', await route(), '|', await win.evaluate(() => document.querySelector('.hero-title, .page-title')?.textContent)) } catch (e) { console.log('FAIL', name, String(e).slice(0, 150)) } }

await go('/')
await check('Home: Release-Karte Titel', async () => { await win.click('.grid .card .card-title a >> nth=0'); await win.waitForTimeout(2500) })
await go('/')
await check('Home: Release-Karte Artist (aufgelöst)', async () => { await win.click('.grid .card .card-sub .artist-resolve a >> nth=0'); await win.waitForTimeout(3000); if (await win.$('.artist-menu')) await win.click('.artist-menu .menu-item >> nth=0'); await win.waitForTimeout(2500) })
await go('/')
await check('Home: Tracktabelle Titel → Track-Seite', async () => { await win.click('.tracktable .tr:not(.head) .t a >> nth=0'); await win.waitForTimeout(3500) })
await win.screenshot({ path: process.argv[2] + '/track.png' })
await check('Track-Seite: Artist-Link', async () => { await win.click('.hero-meta .artists a >> nth=0'); await win.waitForTimeout(3000) })
await go('/')
await check('Home: Tracktabelle Release-Spalte', async () => { await win.click('.tracktable .tr:not(.head) .td.rel a >> nth=0'); await win.waitForTimeout(3000) })
await check('Release: Cover in Track-Zeile? (Release-Seite ohne Cover) → Track-Titel', async () => { await win.click('.tracktable .tr:not(.head) .t a >> nth=0'); await win.waitForTimeout(3000) })
await check('Track-Seite: Release-Link', async () => { await win.click('.hero-meta a.strong'); await win.waitForTimeout(3000) })
await go('/search?q=feint', 5000)
const linked = await win.evaluate(() => [...document.querySelectorAll('.tracktable .tr:not(.head) .sub')].slice(0, 5).map((e) => e.querySelectorAll('.artists a').length))
console.log('Suche: verlinkte Artists je Zeile (nach Anreicherung):', JSON.stringify(linked))
await check('Suche: Track-Artist', async () => { await win.click('.tracktable .tr:not(.head) .sub .artists a >> nth=0'); await win.waitForTimeout(3000) })
// Player-Leiste
await go('/release/001b48d9-16d6-4790-a816-9de66a43cd80', 3000)
await win.dblclick('.tr:not(.head) >> nth=0'); await win.waitForTimeout(3000)
await go('/', 1500)
await check('Player-Leiste: Titel', async () => { await win.click('.pb-title a'); await win.waitForTimeout(3000) })
await go('/', 1500)
await check('Player-Leiste: Artist', async () => { await win.click('.pb-artist a >> nth=0'); await win.waitForTimeout(3000) })
await win.click('.play-btn:not(.big)')
await go('/library', 2500)
await check('Bibliothek: Artist-Überschrift', async () => { await win.click('.lib-artist h2 a'); await win.waitForTimeout(3000); if (await win.$('.artist-menu')) await win.click('.artist-menu .menu-item >> nth=0'); await win.waitForTimeout(2500) })
await go('/library', 2500)
await check('Bibliothek: Track-Titel', async () => { await win.click('.lib-track .t a >> nth=0'); await win.waitForTimeout(3000) })
console.log('ERRORS', JSON.stringify(errors.slice(0, 10)))
await app.close()
