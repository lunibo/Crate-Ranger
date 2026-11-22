// E2E mit gespeicherter Sitzung. Lädt GENAU EINEN Track herunter, wenn E2E_DOWNLOAD=1 gesetzt ist.
// Aufruf: node scripts/e2e-loggedin.mjs <screenshot-dir>
import { _electron as electron } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2] ?? 'e2e-out'
mkdirSync(out, { recursive: true })
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env, executablePath: 'node_modules/electron/dist/electron' })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
await win.setViewportSize({ width: 1400, height: 880 }).catch(() => {})
await win.waitForSelector('.sidebar')
const go = async (h, ms = 3500) => { await win.evaluate((x) => { location.hash = x }, h); await win.waitForTimeout(ms) }
const shot = (n) => win.screenshot({ path: join(out, `${n}.png`) })
const log = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v))

const auth = await win.evaluate(() => window.ss.auth.state())
log('AUTH', auth)
if (!auth.loggedIn) { await app.close(); process.exit(2) }

// Voller Stream
await go('/release/001b48d9-16d6-4790-a816-9de66a43cd80')
await win.dblclick('.tr:not(.head) >> nth=0')
await win.waitForTimeout(7000)
log('PLAYBACK', await win.evaluate(() => ({ src: document.querySelector('.src-badge')?.textContent, times: [...document.querySelectorAll('.pb-progress .time')].map((e) => e.textContent) })))
await win.click('.play-btn:not(.big)') // Pause

// Suche, KI-Suche, Playlists, Favoriten, Ähnliche
await go('/search?q=feint', 4500); await shot('search')
log('SEARCH_SECTIONS', await win.evaluate(() => [...document.querySelectorAll('.section-head h2')].map((e) => e.textContent)))
await go('/search?mode=ai&q=' + encodeURIComponent('calm piano for a rainy evening'), 8000); await shot('search_ai')
log('AI_ROWS', await win.evaluate(() => document.querySelectorAll('.tr:not(.head)').length))
await go('/playlists', 4000); await shot('playlists')
log('PLAYLIST_SECTIONS', await win.evaluate(() => [...document.querySelectorAll('.section-head h2')].map((e) => e.textContent)))
await go('/favorites', 5000); await shot('favorites')
log('FAV_ROWS', await win.evaluate(() => document.querySelectorAll('.tr:not(.head)').length))
await go('/similar/53088d3f-f0d7-4c6a-8eed-c5eff39164ae', 6000); await shot('similar')
log('SIMILAR_ROWS', await win.evaluate(() => document.querySelectorAll('.tr:not(.head)').length))
await go('/settings', 2000); await shot('settings_loggedin')

if (process.env.E2E_DOWNLOAD === '1') {
  const before = await win.evaluate(() => window.ss.downloads.state())
  if (before.jobs.some((j) => ['queued', 'preparing', 'downloading', 'tagging'].includes(j.status))) {
    log('ABORT', 'Warteschlange nicht leer – kein Test-Download')
  } else {
    const n = await win.evaluate(() => window.ss.downloads.enqueueTracks([{ trackId: '53088d3f-f0d7-4c6a-8eed-c5eff39164ae', releaseId: '001b48d9-16d6-4790-a816-9de66a43cd80', title: 'Focus', artist: 'Shingo Nakamura', releaseTitle: 'Focus' }], 'FLAC'))
    log('ENQUEUED', n)
    await go('/downloads', 500)
    let job
    for (let i = 0; i < 120; i++) {
      const s = await win.evaluate(() => window.ss.downloads.state())
      job = s.jobs.find((j) => j.trackId === '53088d3f-f0d7-4c6a-8eed-c5eff39164ae')
      if (i === 3) await shot('downloads_running')
      if (job && ['done', 'skipped', 'error'].includes(job.status)) break
      if (s.paused) { log('PAUSED', s.pauseReason); break }
      await win.waitForTimeout(1000)
    }
    log('JOB', job)
    await shot('downloads_done')
    const lib = await win.evaluate(() => window.ss.library.snapshot())
    log('LIBRARY', { tracks: Object.keys(lib.tracks).length, entry: lib.tracks['53088d3f-f0d7-4c6a-8eed-c5eff39164ae'], release: lib.releases['001b48d9-16d6-4790-a816-9de66a43cd80'] })
    await go('/release/001b48d9-16d6-4790-a816-9de66a43cd80', 3000); await shot('release_status')
    await go('/library', 2500); await shot('library')
  }
}
// Lokale Wiedergabe (falls der Track in der Bibliothek ist) inkl. Spulen
const lib = await win.evaluate(() => window.ss.library.snapshot())
if (lib.tracks['53088d3f-f0d7-4c6a-8eed-c5eff39164ae']) {
  await go('/release/001b48d9-16d6-4790-a816-9de66a43cd80', 2500)
  await win.dblclick('.tr:not(.head) >> nth=0')
  await win.waitForTimeout(3000)
  const s1 = await win.evaluate(() => ({ src: document.querySelector('.src-badge')?.textContent, times: [...document.querySelectorAll('.pb-progress .time')].map((e) => e.textContent) }))
  // Spulen über den Slider (Range-Requests)
  await win.evaluate(() => { const el = document.querySelector('.pb-progress .slider'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '150'); el.dispatchEvent(new Event('input', { bubbles: true })) })
  await win.waitForTimeout(2500)
  const s2 = await win.evaluate(() => [...document.querySelectorAll('.pb-progress .time')].map((e) => e.textContent))
  log('LOCAL_PLAYBACK', { ...s1, afterSeek: s2 })
  await shot('local_playback')
  await win.click('.play-btn:not(.big)')
}
log('ERRORS', errors.slice(0, 15))
await app.close()
