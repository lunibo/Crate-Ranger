import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron'
import appIcon from '../../resources/icon.png?asset'
import { setMainLanguage, t as tr } from './i18n'
import { resolveLanguage } from '@shared/i18n'
import { join } from 'node:path'
import type { ApiParams, CatalogTrack, DownloadFormat, EnqueueResult, EnqueueTrack, PlayRecord, PresenceTrack, Settings, StatEvent, StatsData } from '@shared/types'
import { FORMAT_EXT } from '@shared/types'
import { SoundScoutApi } from './api/client'
import { getAuthState, importSession, logout, openLoginWindow } from './auth'
import { downloadTrack } from './downloads/downloader'
import { buildTrackMeta } from './downloads/meta'
import { MetadataService } from './downloads/metadata'
import { buildTrackPath } from './downloads/paths'
import { DownloadQueue } from './downloads/queue'
import { splitPreReleases } from './downloads/prerelease'
import { QuotaTracker, type PlanStatus } from './downloads/quota'
import { assertAllowed, assertId } from './ipc'
import { refreshLibrary } from './library/refresh'
import { UpdateChecker } from './update'
import { scanFolder } from './library/scanner'
import { LibraryStore } from './library/store'
import { handleMediaProtocol, isInside, registerMediaScheme } from './mediaProtocol'
import { migrateUserData } from './migrate'
import { getSettings, updateSettings } from './settings'
import { clearStreamCache, resolveStreamUrl } from './stream'
import { DiscordPresence } from './discord/presence'
import { COVER_SCHEME, CoverCache, serveCover } from './cache/coverCache'
import { DEFAULT_DISCORD_CLIENT_ID } from '@shared/discord'
import { StatsStore } from './stats/store'

const PARTITION = 'persist:soundscout'
const FORMATS: DownloadFormat[] = ['FLAC', 'MP3_320', 'WAV']

// Eigener Datenordner für Tests/Entwicklung (z.B. Demo-Statistiken), ohne echte Daten anzufassen
if (process.env.CRATE_RANGER_USER_DATA) app.setPath('userData', process.env.CRATE_RANGER_USER_DATA)
else migrateUserData()
registerMediaScheme()
if (!app.requestSingleInstanceLock()) app.quit()
if (process.platform === 'linux') {
  // WSL/VMs: GPU ist oft blockiert → WebGL per Software, sonst scheitert Cloudflare Turnstile beim Login.
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
  app.commandLine.appendSwitch('enable-unsafe-swiftshader')
}

let mainWindow: BrowserWindow | null = null

function toEnqueue(t: CatalogTrack): EnqueueTrack {
  return {
    trackId: t.TrackID,
    releaseId: t.ReleaseID,
    title: t.Version ? `${t.Title} (${t.Version})` : t.Title,
    artist: t.ArtistsTitle,
    releaseTitle: t.ReleaseTitle,
    releaseDate: t.ReleaseDate
  }
}

function asFormat(f: unknown): DownloadFormat {
  return FORMATS.includes(f as DownloadFormat) ? (f as DownloadFormat) : getSettings().format
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 620,
    show: false,
    title: 'Crate Ranger',
    backgroundColor: '#0b0f17',
    icon: appIcon,
    autoHideMenuBar: true,
    // Eigene Titelleiste im Renderer (layout/TitleBar.tsx); die Fensterknöpfe zeichnet weiter
    // das System, nur farblich angepasst – so bleiben z. B. die Snap-Layouts von Windows erhalten.
    // Farbe/Höhe müssen zu .titlebar und --titlebar-h in app.css passen.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#121a2a', symbolColor: '#9aa6bb', height: 40 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl && url.startsWith(devUrl)) return
    if (url.startsWith('file://')) return
    e.preventDefault()
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

app.whenReady().then(() => {
  const applyMainLanguage = (): void => setMainLanguage(resolveLanguage(getSettings().language, app.getPreferredSystemLanguages()))
  applyMainLanguage()
  const ses = session.fromPartition(PARTITION)
  // Bewusst der echte Electron-User-Agent: ein gefälschter Chrome-UA passt nicht zu den Browser-Merkmalen
  // und lässt Cloudflare Turnstile scheitern. Die API selbst prüft nur das Session-Cookie (goldloginz).
  const ua = ses.getUserAgent()
  ses.setUserAgent(ua, 'de-DE,de,en-US,en')
  const api = new SoundScoutApi(ses, ua)
  const userData = app.getPath('userData')
  const library = new LibraryStore(join(userData, 'library.json'))
  const metadata = new MetadataService(api)
  const quota = new QuotaTracker(join(userData, 'download-log.json'))
  // Abo-Status (Abrechnungszeitraum) für die Kontingent-Schätzung, 10 min gecacht
  let plan: { value: PlanStatus | null; at: number } = { value: null, at: 0 }
  const planStatus = async (force = false): Promise<PlanStatus | null> => {
    if (!force && Date.now() - plan.at < 10 * 60_000) return plan.value
    try {
      plan = { value: await api.get<PlanStatus>('/subscribe/status'), at: Date.now() }
    } catch {
      plan = { value: null, at: Date.now() }
    }
    return plan.value
  }
  const quotaInfo = async (force = false) => quota.info(await planStatus(force))
  const queue = new DownloadQueue({
    stateFile: join(userData, 'queue.json'),
    concurrency: () => getSettings().concurrency,
    worker: async (job, ctx) => {
      try {
        const result = await downloadTrack({ api, metadata, library, settings: getSettings }, job, ctx)
        if (result.status === 'done') quota.record(job.trackId, job.format)
        return result
      } catch (e) {
        const code = (e as { code?: string })?.code
        if (code === 'download.monthly_limit' || code === 'download.trial_allowance_used') {
          quota.markLimitReached(e instanceof Error ? e.message : String(e))
        }
        throw e
      }
    }
  })

  const covers = new CoverCache(join(userData, 'Cover Cache'), (url) => api.fetchAbsolute(url))
  ses.protocol.handle(COVER_SCHEME, (req) => serveCover(covers, req.url))

  handleMediaProtocol(ses.protocol, (p) => {
    if (isInside(p, getSettings().downloadRoot)) return true
    return Object.values(library.snapshot().tracks).some((t) => t.files.some((f) => isInside(p, f.path)))
  })

  const send = (channel: string, payload: unknown): void => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
  }
  queue.onChange((s) => send('downloads:update', s))
  library.onChange((s) => send('library:update', s))
  quota.onChange(() => void quotaInfo().then((q) => send('downloads:quota', q)))
  const refreshQuota = (): void => void quotaInfo(true).then((q) => send('downloads:quota', q))

  // ---------- API ----------
  ipcMain.handle('api:get', (_e, path: unknown, params?: ApiParams) => api.get(assertAllowed('GET', path), params ?? undefined))
  ipcMain.handle('api:post', (_e, path: unknown, body?: unknown, params?: ApiParams) =>
    api.post(assertAllowed('POST', path), body, params ?? undefined)
  )

  // ---------- Auth ----------
  ipcMain.handle('auth:state', () => getAuthState(api))
  ipcMain.handle('auth:login', async () => {
    const state = await openLoginWindow(mainWindow, ses, api)
    clearStreamCache()
    refreshQuota()
    return state
  })
  ipcMain.handle('auth:importSession', async (_e, value: unknown) => {
    const state = await importSession(api, ses, value)
    clearStreamCache()
    refreshQuota()
    return state
  })
  ipcMain.handle('auth:openBrowserLogin', () => shell.openExternal('https://www.soundscout.com/sign-in'))
  ipcMain.handle('auth:logout', async () => {
    clearStreamCache()
    const state = await logout(api, ses)
    refreshQuota()
    return state
  })

  // ---------- Player ----------
  ipcMain.handle('player:resolve', (_e, trackId: unknown, force?: boolean) => resolveStreamUrl(api, assertId(trackId), !!force))

  // ---------- Downloads ----------
  const enqueue = (tracks: EnqueueTrack[], format: unknown, force: unknown): EnqueueResult => {
    const { ready, result } = splitPreReleases(tracks)
    return { ...result, added: queue.enqueue(ready, asFormat(format), !!force) }
  }
  ipcMain.handle('downloads:enqueueTracks', (_e, tracks: EnqueueTrack[], format?: unknown, force?: boolean) => {
    const clean = (Array.isArray(tracks) ? tracks : [])
      .filter((t) => t && typeof t.trackId === 'string' && typeof t.releaseId === 'string')
      .map((t) => ({ ...t, trackId: assertId(t.trackId), releaseId: assertId(t.releaseId) }))
    return enqueue(clean, format, force)
  })
  ipcMain.handle('downloads:enqueueRelease', async (_e, releaseId: unknown, format?: unknown, force?: boolean) => {
    const tracks = await metadata.releaseTracks(assertId(releaseId))
    return enqueue(tracks.map(toEnqueue), format, force)
  })
  ipcMain.handle('downloads:enqueuePlaylist', async (_e, playlistId: unknown, format?: unknown, force?: boolean) => {
    const tracks = await metadata.playlistTracks(assertId(playlistId))
    return enqueue(tracks.map(toEnqueue), format, force)
  })
  ipcMain.handle('downloads:state', () => queue.state())
  ipcMain.handle('downloads:quota', () => quotaInfo())
  ipcMain.handle('downloads:pause', () => queue.pause(tr('queue.pausedManually')))
  ipcMain.handle('downloads:resume', () => queue.resume())
  ipcMain.handle('downloads:cancel', (_e, id: unknown) => queue.cancel(assertId(id)))
  ipcMain.handle('downloads:retry', (_e, id?: unknown) => queue.retry(id ? assertId(id) : undefined))
  ipcMain.handle('downloads:clearFinished', () => queue.clearFinished())

  // ---------- Hörstatistiken (lokal) ----------
  const stats = new StatsStore(join(userData, 'stats'))
  const appStart = Date.now()
  ipcMain.on('stats:play', (_e, record: Partial<PlayRecord>, final: boolean) => {
    if (getSettings().statsEnabled) stats.play(record, !!final)
  })
  ipcMain.on('stats:event', (_e, ev: Partial<StatEvent>) => {
    if (getSettings().statsEnabled && ev && typeof ev === 'object') stats.event(ev.type, ev.ref)
  })
  // ---------- Cache ----------
  ipcMain.handle('cache:info', async () => ({ coverBytes: covers.size, coverCount: covers.count, httpBytes: await ses.getCacheSize() }))
  ipcMain.handle('cache:clear', async () => {
    await covers.clear()
    await ses.clearCache()
    clearStreamCache()
  })
  ipcMain.handle('stats:get', (): StatsData => ({ plays: stats.plays(), events: stats.events(), downloads: quota.history() }))
  ipcMain.handle('stats:clear', () => stats.clear())

  // ---------- Discord Rich Presence ----------
  const presence = new DiscordPresence({
    enabled: () => getSettings().discordEnabled,
    clientId: () => DEFAULT_DISCORD_CLIENT_ID,
    labels: () => ({ by: (artists) => tr('discord.by', { artists }), button: tr('discord.button') }),
    onStatus: (s) => send('presence:status', s)
  })
  presence.refresh()
  ipcMain.on('presence:update', (_e, track: PresenceTrack | null) => {
    if (track !== null && (typeof track !== 'object' || typeof track.title !== 'string')) return
    presence.update(track)
  })
  ipcMain.handle('presence:status', () => presence.getStatus())

  // ---------- Bibliothek ----------
  ipcMain.handle('library:snapshot', () => library.snapshot())
  ipcMain.handle('library:verify', () => {
    const r = library.verify()
    return { scanned: r.checked, added: 0, missing: r.missing }
  })
  ipcMain.handle('library:scan', () => scanFolder(getSettings().downloadRoot, library))
  let refreshing = false
  ipcMain.handle('library:refresh', async () => {
    if (refreshing) throw new Error(tr('errors.refreshRunning'))
    if (queue.isBusy()) throw new Error(tr('errors.refreshBusy'))
    refreshing = true
    // Während des Umsortierens keine neuen Downloads starten
    const wasPaused = queue.state().paused
    if (!wasPaused) queue.pause(tr('queue.pausedForRefresh'))
    try {
      return await refreshLibrary({ api, metadata, library, settings: getSettings }, (p) => send('library:refreshProgress', p))
    } finally {
      refreshing = false
      library.flush()
      if (!wasPaused) queue.resume()
    }
  })
  ipcMain.handle('library:remove', (_e, trackId: unknown, deleteFiles?: boolean) => library.remove(assertId(trackId), !!deleteFiles))
  ipcMain.handle('library:linkRelease', (_e, releaseId: unknown, trackIds: unknown, trackTotal: unknown) => {
    const ids = (Array.isArray(trackIds) ? trackIds : []).slice(0, 1000).map(assertId)
    library.linkRelease(assertId(releaseId), ids, typeof trackTotal === 'number' ? trackTotal : 0)
  })

  // ---------- Einstellungen ----------
  ipcMain.handle('settings:get', () => getSettings())
  // ---------- Updates (GitHub-Releases, nur mit Zustimmung) ----------
  const updates = new UpdateChecker(app.getVersion(), join(userData, 'update.json'), () => getSettings().updateCheck === true)
  updates.onChange((s) => send('update:state', s))
  ipcMain.handle('update:state', () => updates.getState())
  ipcMain.handle('update:check', () => updates.check(true))
  updates.start()

  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    const before = getSettings()
    const next = updateSettings(patch ?? {})
    if (next.language !== before.language) applyMainLanguage()
    if (next.discordEnabled !== before.discordEnabled) presence.refresh()
    if (next.concurrency !== before.concurrency) queue.pump()
    if (next.updateCheck !== before.updateCheck) updates.start() // eingeschaltet → gleich prüfen, ausgeschaltet → stoppen
    return next
  })
  ipcMain.handle('settings:chooseFolder', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      title: tr('settings.downloads.chooseFolderTitle'),
      defaultPath: getSettings().downloadRoot,
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0]
  })
  ipcMain.handle('settings:previewPath', (_e, template: unknown) => {
    const s = getSettings()
    const sample = buildTrackMeta(
      {
        TrackID: 'preview', Title: 'Focus', Version: 'Extended Mix', ArtistsTitle: 'Shingo Nakamura',
        ReleaseID: 'preview', ReleaseTitle: 'Focus', ReleaseArtistsTitle: 'Shingo Nakamura',
        ReleaseDate: '2022-04-20T07:00:00Z', ReleaseDateTimezone: 'America/Vancouver', ReleaseType: 'Single',
        ReleaseCatalogID: 'MCS1380', TrackNumber: 2, BrandTitle: 'Silk', LabelTitle: 'Monstercat'
      },
      { trackTotal: 2 }
    )
    return buildTrackPath(s.downloadRoot, typeof template === 'string' ? template : s.pathTemplate, sample, FORMAT_EXT[s.format])
  })

  // ---------- Shell ----------
  ipcMain.handle('shell:showItem', (_e, p: unknown) => {
    if (typeof p === 'string') shell.showItemInFolder(p)
  })
  ipcMain.handle('shell:openPath', async (_e, p: unknown) => {
    if (typeof p === 'string') await shell.openPath(p)
  })
  ipcMain.handle('shell:openExternal', async (_e, url: unknown) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) await shell.openExternal(url)
  })

  mainWindow = createWindow()
  library.verify()

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
  app.on('before-quit', () => {
    queue.flush()
    library.flush()
    quota.flush()
    presence.stop()
    stats.flush()
    if (getSettings().statsEnabled) stats.event('session', undefined, Date.now() - appStart)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
