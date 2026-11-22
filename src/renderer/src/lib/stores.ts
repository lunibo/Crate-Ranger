import { create } from 'zustand'
import type { AuthState, DownloadFormat, EnqueueResult, LibrarySnapshot, QueueState, QuotaInfo, Settings } from '@shared/types'
import { errorMessage, favoritesPlaylist, playlistTracks, setFavorite, type TrackLite } from './api'
import { queryClient } from './queryClient'
import { applyLanguage, t } from './i18n'
import { fmtDateTime, fmtDay } from './format'

// ---------- Toasts ----------
export interface Toast {
  id: number
  kind: 'info' | 'success' | 'error' | 'warning'
  text: string
}
interface ToastStore {
  toasts: Toast[]
  push(kind: Toast['kind'], text: string, ms?: number): void
  dismiss(id: number): void
}
let toastId = 0
export const useToasts = create<ToastStore>((set) => ({
  toasts: [],
  push(kind, text, ms = 4500) {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }))
    if (ms > 0) setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms)
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  }
}))
export const toast = (kind: Toast['kind'], text: string, ms?: number): void => useToasts.getState().push(kind, text, ms)

// ---------- Auth ----------
interface AuthStore {
  state: AuthState | null
  busy: boolean
  dialog: boolean
  openDialog(open: boolean): void
  refresh(): Promise<void>
  login(): Promise<void>
  importSession(value: string): Promise<boolean>
  logout(): Promise<void>
}
export const useAuth = create<AuthStore>((set) => ({
  state: null,
  busy: false,
  dialog: false,
  openDialog(open) {
    set({ dialog: open })
  },
  async importSession(value) {
    set({ busy: true })
    try {
      const state = await window.ss.auth.importSession(value)
      set({ state })
      if (state.loggedIn) {
        set({ dialog: false })
        toast('success', state.planName ? t('auth.signedInAs', { plan: state.planName }) : t('auth.signedIn'))
        return true
      }
      toast('error', state.error ?? t('auth.signInFailed'))
      return false
    } finally {
      set({ busy: false })
    }
  },
  async refresh() {
    set({ state: await window.ss.auth.state() })
  },
  async login() {
    set({ busy: true })
    try {
      const state = await window.ss.auth.login()
      set({ state })
      if (state.loggedIn) {
        set({ dialog: false })
        toast('success', state.planName ? t('auth.signedInAs', { plan: state.planName }) : t('auth.signedIn'))
      }
    } finally {
      set({ busy: false })
    }
  },
  async logout() {
    set({ busy: true })
    try {
      set({ state: await window.ss.auth.logout() })
      toast('info', t('auth.signedOut'))
    } finally {
      set({ busy: false })
    }
  }
}))

// ---------- Favoriten (SoundScout-Bibliothek „Favorites“) ----------
interface FavoritesStore {
  ids: Set<string>
  playlistId: string | null
  loaded: boolean
  load(): Promise<void>
  clear(): void
  toggle(track: Pick<TrackLite, 'trackId' | 'title'>): Promise<void>
}
export const useFavorites = create<FavoritesStore>((set, get) => ({
  ids: new Set(),
  playlistId: null,
  loaded: false,
  async load() {
    try {
      const pl = await favoritesPlaylist()
      const ids = new Set<string>()
      for (let offset = 0; offset < 10000; offset += 50) {
        const r = await playlistTracks(pl.ID, offset, 50)
        for (const it of r.Data ?? []) ids.add(it.TrackID)
        if ((r.Data ?? []).length < 50) break
      }
      set({ ids, playlistId: pl.ID, loaded: true })
    } catch {
      set({ loaded: false })
    }
  },
  clear() {
    set({ ids: new Set(), playlistId: null, loaded: false })
  },
  async toggle(track) {
    if (!useAuth.getState().state?.loggedIn) {
      toast('warning', t('favorites.signInRequired'))
      useAuth.getState().openDialog(true)
      return
    }
    const was = get().ids.has(track.trackId)
    const apply = (fav: boolean): void => {
      const ids = new Set(get().ids)
      if (fav) ids.add(track.trackId)
      else ids.delete(track.trackId)
      set({ ids })
    }
    apply(!was) // sofort anzeigen
    try {
      await setFavorite(track.trackId, !was)
      window.ss.stats.event({ type: was ? 'unfavorite' : 'favorite', ref: track.trackId })
      toast('success', !was ? t('favorites.added', { title: track.title }) : t('favorites.removed', { title: track.title }), 2500)
      const id = get().playlistId
      if (id) void queryClient.invalidateQueries({ queryKey: ['playlist-tracks', id] })
    } catch (e) {
      apply(was)
      toast('error', t('favorites.saveFailed', { error: errorMessage(e) }))
    }
  }
}))

// ---------- Bibliothek ----------
export type DlStatus = 'none' | 'downloaded' | 'missing'

interface LibraryStore {
  snap: LibrarySnapshot
  init(): Promise<void>
}
export const useLibrary = create<LibraryStore>((set) => ({
  snap: { tracks: {}, releases: {} },
  async init() {
    set({ snap: await window.ss.library.snapshot() })
    window.ss.library.onUpdate((snap) => set({ snap }))
  }
}))

export function trackStatus(snap: LibrarySnapshot, trackId: string): DlStatus {
  const t = snap.tracks[trackId]
  if (!t) return 'none'
  return t.files.some((f) => !f.missing) ? 'downloaded' : 'missing'
}

export function localFile(snap: LibrarySnapshot, trackId: string): string | null {
  const f = snap.tracks[trackId]?.files.find((x) => !x.missing)
  return f ? f.path : null
}

export function releaseProgress(snap: LibrarySnapshot, releaseId: string, total?: number): { done: number; total: number } {
  const done = Object.values(snap.tracks).filter((t) => t.releaseId === releaseId && t.files.some((f) => !f.missing)).length
  return { done, total: total ?? snap.releases[releaseId]?.trackTotal ?? 0 }
}

// ---------- Downloads ----------
interface DownloadStore {
  queue: QueueState
  init(): Promise<void>
}
export const useDownloads = create<DownloadStore>((set) => ({
  queue: { jobs: [], paused: false },
  async init() {
    set({ queue: await window.ss.downloads.state() })
    window.ss.downloads.onUpdate((queue) => set({ queue }))
  }
}))

export const queuedTrackIds = (q: QueueState): Set<string> =>
  new Set(q.jobs.filter((j) => ['queued', 'preparing', 'downloading', 'tagging'].includes(j.status)).map((j) => j.trackId))

// ---------- Download-Kontingent ----------
interface QuotaStore {
  quota: QuotaInfo | null
  init(): Promise<void>
}
export const useQuota = create<QuotaStore>((set) => ({
  quota: null,
  async init() {
    set({ quota: await window.ss.downloads.quota() })
    window.ss.downloads.onQuota((quota) => set({ quota }))
  }
}))

const OPEN_STATUSES = ['queued', 'preparing', 'downloading', 'tagging']

/** Warnt, wenn die offene Warteschlange das geschätzte Restkontingent übersteigt. */
async function warnIfOverQuota(): Promise<void> {
  const [q, state] = await Promise.all([window.ss.downloads.quota(), window.ss.downloads.state()])
  if (q.remaining === null) return
  const open = state.jobs.filter((j) => OPEN_STATUSES.includes(j.status)).length
  if (open > q.remaining) {
    toast(
      'warning',
      t('quota.queueExceeds', { count: open, remaining: q.remaining }) +
        (q.periodEnd ? ' ' + t('quota.resetOn', { date: fmtDay(q.periodEnd) }) + '.' : '') +
        ' ' + t('quota.skippedDontCount'),
      9000
    )
  }
}

// ---------- Einstellungen ----------
interface SettingsStore {
  settings: Settings | null
  init(): Promise<void>
  update(patch: Partial<Settings>): Promise<void>
}
export const useSettings = create<SettingsStore>((set) => ({
  settings: null,
  async init() {
    const settings = await window.ss.settings.get()
    applyLanguage(settings.language)
    set({ settings })
  },
  async update(patch) {
    const settings = await window.ss.settings.set(patch)
    if (patch.language !== undefined) applyLanguage(settings.language)
    set({ settings })
  }
}))

// ---------- Download-Aktionen ----------
async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
  const auth = useAuth.getState().state
  if (!auth?.loggedIn) {
    toast('warning', t('download.signInRequired'))
    useAuth.getState().openDialog(true)
    return undefined
  }
  try {
    return await fn()
  } catch (e) {
    toast('error', errorMessage(e))
    return undefined
  }
}

const added = (r: EnqueueResult | undefined): void => {
  if (!r) return
  if (r.skippedPreRelease) {
    toast(
      'warning',
      t('preRelease.skipped', { count: r.skippedPreRelease, date: r.availableFrom ? fmtDateTime(r.availableFrom) : '' }),
      8000
    )
  }
  if (r.added) toast('success', t('download.queued', { count: r.added }))
  else if (!r.skippedPreRelease) toast('info', t('download.alreadyQueued'))
  if (r.added) void warnIfOverQuota()
}

export const downloadTracks = async (tracks: TrackLite[], format?: DownloadFormat, force = false): Promise<void> =>
  added(
    await guard(() =>
      window.ss.downloads.enqueueTracks(
        tracks.map((t) => ({
          trackId: t.trackId,
          releaseId: t.releaseId,
          title: t.version ? `${t.title} (${t.version})` : t.title,
          artist: t.artistsTitle,
          releaseTitle: t.releaseTitle,
          releaseDate: t.releaseDate
        })),
        format,
        force
      )
    )
  )

export const downloadRelease = async (releaseId: string, format?: DownloadFormat, force = false): Promise<void> =>
  added(await guard(() => window.ss.downloads.enqueueRelease(releaseId, format, force)))

export const downloadPlaylist = async (playlistId: string, format?: DownloadFormat, force = false): Promise<void> =>
  added(await guard(() => window.ss.downloads.enqueuePlaylist(playlistId, format, force)))
