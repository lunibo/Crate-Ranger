import { create } from 'zustand'
import { errorMessage, releaseCover, similarTo, toTrack, type TrackLite } from '../lib/api'
import { localFile, toast, useLibrary, useSettings } from '../lib/stores'
import { t } from '../lib/i18n'
import { clearUpcoming, firstAutoplayPos, insertAt, moveUpcoming, removeUpcoming } from './queueOps'
import { trackerFinish, trackerSeeked, trackerStart, trackerTime } from './playTracker'

type Repeat = 'off' | 'all' | 'one'

interface PlayerState {
  queue: TrackLite[]
  order: number[] // Abspielreihenfolge (Indizes in queue), bei Shuffle gemischt
  pos: number // Position in order
  current: TrackLite | null
  playing: boolean
  loading: boolean
  time: number
  duration: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: Repeat
  source: 'stream' | 'local' | null
  /** einmalige Nachfrage „Endlos hören aktivieren?“ anzeigen */
  autoplayPrompt: boolean
  answerAutoplay(enable: boolean): void
  playList(tracks: TrackLite[], startIndex?: number): void
  jumpTo(pos: number): void
  playNext(tracks: TrackLite | TrackLite[]): void
  addToQueue(tracks: TrackLite[]): void
  /** Kommenden Track von Position `from` nach `to` verschieben (Positionen in order, beide nach pos) */
  moveInQueue(from: number, to: number): void
  /** Kommenden Track an Position `at` (in order) aus der Warteschlange entfernen */
  removeFromQueue(at: number): void
  /** Alle kommenden Tracks entfernen – der aktuelle läuft weiter, „Endlos hören“ übernimmt danach */
  clearQueue(): void
  toggle(): void
  next(auto?: boolean): void
  prev(): void
  seek(t: number): void
  setVolume(v: number): void
  toggleMute(): void
  toggleShuffle(): void
  cycleRepeat(): void
}

// Zwei Audio-Elemente: das aktive spielt, das zweite lädt kurz vor Ende den nächsten Track vor.
// Beim Wechsel werden sie getauscht → kein Warten auf URL-Auflösung und Puffern.
const elements = [new Audio(), new Audio()]
for (const el of elements) el.preload = 'auto'
let audio = elements[0]
let standby = elements[1]

/** Event-Listener auf beiden Elementen, der nur für das gerade aktive feuert */
function onAudio<K extends keyof HTMLMediaElementEventMap>(type: K, fn: (e: HTMLMediaElementEventMap[K]) => void): void {
  for (const el of elements) el.addEventListener(type, (e) => { if (el === audio) fn(e) })
}

function shuffled(n: number, first: number): number[] {
  const rest = [...Array(n).keys()].filter((i) => i !== first)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return [first, ...rest]
}

let loadToken = 0
/** Position, an der ein wiederhergestellter Track beim ersten Abspielen fortgesetzt wird */
let resumeAt: { trackId: string; time: number } | null = null
let pendingSeek: number | null = null

async function load(track: TrackLite, autoplay = true, forceResolve = false): Promise<void> {
  const token = ++loadToken
  if (!forceResolve) trackerFinish('switch') // Neustart/Trackwechsel = neue Wiedergabe; Neuversuch nicht
  const resume = resumeAt?.trackId === track.trackId ? resumeAt.time : 0
  resumeAt = null
  pendingSeek = resume > 0 ? resume : null
  usePlayer.setState({ current: track, loading: true, time: resume, duration: track.duration })
  // Vorgeladen? → Elemente tauschen und sofort weiterspielen
  if (!forceResolve && !resume && standby.dataset.trackId === track.trackId && standby.src && !standby.error) {
    const prev = audio
    audio = standby
    standby = prev
    audio.volume = prev.volume
    audio.muted = prev.muted
    resetStandby()
    prev.pause()
    usePlayer.setState({ source: audio.dataset.source === 'local' ? 'local' : 'stream', loading: audio.readyState < 3 })
    if (Number.isFinite(audio.duration)) usePlayer.setState({ duration: audio.duration })
    if (audio.currentTime) audio.currentTime = 0
    try {
      if (autoplay) await audio.play()
      updateMediaSession(track)
    } catch (e) {
      if (token !== loadToken) return
      usePlayer.setState({ loading: false, playing: false })
      toast('error', t('player.playbackFailed', { error: errorMessage(e) }))
    }
    return
  }
  try {
    const local = localFile(useLibrary.getState().snap, track.trackId)
    let src: string
    let source: 'stream' | 'local'
    if (local && !forceResolve) {
      src = window.ss.player.localUrl(local)
      source = 'local'
    } else {
      src = await window.ss.player.resolve(track.trackId, forceResolve)
      source = 'stream'
    }
    if (token !== loadToken) return
    audio.src = src
    audio.dataset.trackId = track.trackId
    audio.dataset.source = source
    usePlayer.setState({ source })
    if (autoplay) await audio.play()
    updateMediaSession(track)
  } catch (e) {
    if (token !== loadToken) return
    usePlayer.setState({ loading: false, playing: false })
    toast('error', t('player.playbackFailed', { error: errorMessage(e) }))
  }
}

function updateMediaSession(t: TrackLite): void {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.version ? `${t.title} (${t.version})` : t.title,
    artist: t.artistsTitle,
    album: t.releaseTitle,
    artwork: [{ src: releaseCover(t.releaseId, 512), sizes: '512x512', type: 'image/webp' }]
  })
}

// ---------- Nächsten Track vorladen ----------

/** Ab dieser Restzeit (s) wird der nächste Track ins zweite Audio-Element geladen */
const PRELOAD_AUDIO_BEFORE_END = 30
let urlResolvedFor: string | null = null
let preloadToken = 0

function resetStandby(): void {
  preloadToken++
  standby.removeAttribute('src')
  delete standby.dataset.trackId
  delete standby.dataset.source
  standby.load() // bricht laufendes Puffern ab
}

/** Track, der nach dem aktuellen automatisch kommt (ohne „Endlos hören“-Nachladen) */
function upcomingTrack(): TrackLite | null {
  const { order, pos, queue, repeat } = usePlayer.getState()
  if (!queue.length || repeat === 'one') return null
  if (pos + 1 < order.length) return queue[order[pos + 1]]
  return repeat === 'all' ? queue[order[0]] : null
}

/**
 * Stufe 1: sobald ein Track läuft, die Stream-URL des nächsten auflösen (Hauptprozess cacht sie 24 h).
 * Stufe 2: kurz vor Ende den Anfang des nächsten Tracks im zweiten Element puffern.
 * Erst so spät, damit beim Überspringen kaum Daten umsonst geladen werden.
 */
function preloadNext(): void {
  const { current, playing } = usePlayer.getState()
  const next = upcomingTrack()
  if (!current || !next || next.trackId === current.trackId) return
  const local = localFile(useLibrary.getState().snap, next.trackId)
  if (!local && urlResolvedFor !== next.trackId) {
    urlResolvedFor = next.trackId
    void window.ss.player.resolve(next.trackId).catch(() => (urlResolvedFor = null))
  }
  if (!playing || standby.dataset.trackId === next.trackId) return
  const total = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : current.duration
  if (!total || total - audio.currentTime > PRELOAD_AUDIO_BEFORE_END) return
  const token = ++preloadToken
  standby.dataset.trackId = next.trackId
  void (async () => {
    try {
      const src = local ? window.ss.player.localUrl(local) : await window.ss.player.resolve(next.trackId)
      if (token !== preloadToken) return
      standby.dataset.source = local ? 'local' : 'stream'
      standby.src = src
      standby.load()
    } catch {
      if (token === preloadToken) delete standby.dataset.trackId
    }
  })()
}

// ---------- Endlos hören ----------

const AUTOPLAY_BATCH = 10
let extending: Promise<number> | null = null

/** Gleicher Song unabhängig von der Version („Focus“ = „Focus (Extended Mix)“) – Endlos hören soll neue Songs bringen. */
const songKey = (title: string, artists: string): string =>
  `${title.replace(/\s*[([].*$/, '').trim().toLowerCase()}|${artists.trim().toLowerCase()}`

/** Hängt ähnliche Tracks zum letzten Track der Warteschlange an. Liefert die Anzahl neuer Tracks. */
function extendWithSimilar(): Promise<number> {
  if (extending) return extending
  extending = (async () => {
    const { queue, order } = usePlayer.getState()
    const seed = queue[order[order.length - 1]]
    if (!seed) return 0
    try {
      const res = await similarTo(seed.trackId, 40)
      const s = usePlayer.getState()
      const known = new Set(s.queue.map((x) => x.trackId))
      const songs = new Set(s.queue.map((x) => songKey(x.title, x.artistsTitle)))
      const fresh: TrackLite[] = []
      for (const row of res.Data ?? []) {
        if (fresh.length >= AUTOPLAY_BATCH) break
        const key = songKey(row.Title ?? '', row.ArtistsTitle ?? '')
        // schon in der Warteschlange (inkl. Seed) oder nur eine andere Version eines Songs darin
        if (known.has(row.TrackID) || songs.has(key)) continue
        known.add(row.TrackID)
        songs.add(key)
        fresh.push({ ...toTrack(row), autoplay: true })
      }
      if (!fresh.length) return 0
      // Warteschlange kann sich inzwischen geändert haben – nur anhängen, wenn der Seed noch das Ende ist
      if (s.queue[s.order[s.order.length - 1]]?.trackId !== seed.trackId) return 0
      const start = s.queue.length
      usePlayer.setState({ queue: [...s.queue, ...fresh], order: [...s.order, ...fresh.map((_, i) => start + i)] })
      return fresh.length
    } catch {
      return 0 // z.B. nicht angemeldet → einfach enden
    } finally {
      extending = null
    }
  })()
  return extending
}

const autoplayOn = (): boolean => useSettings.getState().settings?.autoplay === true

/** Läuft der letzte Track, schon jetzt ähnliche Tracks anhängen (kein Stocken beim Übergang). */
function prefetchAutoplay(): void {
  const { order, pos, repeat, queue } = usePlayer.getState()
  if (!autoplayOn() || repeat !== 'off' || !queue.length) return
  if (pos >= order.length - 1) void extendWithSimilar()
}

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  order: [],
  pos: 0,
  current: null,
  playing: false,
  loading: false,
  time: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeat: 'off',
  source: null,
  autoplayPrompt: false,

  answerAutoplay(enable) {
    set({ autoplayPrompt: false })
    void useSettings.getState().update({ autoplay: enable })
    // Zugestimmt → gleich weiterhören, wo die Wiedergabe gerade geendet hat
    if (enable) {
      void extendWithSimilar().then((n) => {
        const { pos, order, playing } = get()
        if (n && !playing && pos < order.length - 1) get().next()
      })
    }
  },

  playList(tracks, startIndex = 0) {
    if (!tracks.length) return
    const order = get().shuffle ? shuffled(tracks.length, startIndex) : [...tracks.keys()]
    const pos = get().shuffle ? 0 : startIndex
    set({ queue: tracks, order, pos })
    void load(tracks[order[pos]])
  },
  jumpTo(pos) {
    const { order, queue } = get()
    if (pos < 0 || pos >= order.length) return
    set({ pos })
    void load(queue[order[pos]])
  },
  playNext(tracks) {
    const list = Array.isArray(tracks) ? tracks : [tracks]
    if (!list.length) return
    const { queue, order, pos, current } = get()
    if (!current) return get().playList(list)
    set(insertAt(queue, order, pos + 1, list))
    toast('info', list.length === 1 ? t('player.playingNext', { title: list[0].title }) : t('player.playingNextMany', { count: list.length }))
  },
  addToQueue(tracks) {
    if (!tracks.length) return
    const { queue, order, pos, current } = get()
    if (!current) return get().playList(tracks)
    // Vor den automatisch angehängten „Endlos hören“-Tracks einreihen, nicht dahinter
    set(insertAt(queue, order, firstAutoplayPos(queue, order, pos), tracks))
    toast('info', t('player.addedToQueue', { count: tracks.length }))
  },
  moveInQueue(from, to) {
    const { queue, order, pos, shuffle } = get()
    const r = moveUpcoming(queue, order, pos, from, to, shuffle)
    if (r) set(r)
  },
  removeFromQueue(at) {
    const { queue, order, pos, shuffle } = get()
    const r = removeUpcoming(queue, order, pos, at, shuffle)
    if (r) set(r)
  },
  clearQueue() {
    const { queue, order, pos, shuffle } = get()
    const r = clearUpcoming(queue, order, pos, shuffle)
    if (r) set(r)
  },
  toggle() {
    const { current } = get()
    if (!current) return
    if (audio.paused) {
      if (!audio.src) void load(current)
      else void audio.play().catch(() => load(current, true, true))
    } else audio.pause()
  },
  next(auto = false) {
    const { order, pos, queue, repeat } = get()
    if (!queue.length) return
    if (auto && repeat === 'one') {
      audio.currentTime = 0
      void audio.play()
      return
    }
    let np = pos + 1
    if (np >= order.length) {
      if (repeat === 'all') np = 0
      else if (autoplayOn()) {
        // Ende der Warteschlange → ähnliche Tracks anhängen und weiterspielen
        set({ loading: true })
        void extendWithSimilar().then((n) => {
          if (n) get().next(auto)
          else set({ playing: false, loading: false })
        })
        return
      } else if (!auto) np = 0
      else {
        set({ playing: false })
        // Noch nie entschieden → einmal nachfragen, ob „Endlos hören“ aktiviert werden soll
        if (useSettings.getState().settings?.autoplay === null) set({ autoplayPrompt: true })
        return
      }
    }
    set({ pos: np })
    void load(queue[order[np]])
  },
  prev() {
    const { order, pos, queue } = get()
    if (!queue.length) return
    if (audio.currentTime > 3) {
      audio.currentTime = 0
      return
    }
    const np = pos > 0 ? pos - 1 : order.length - 1
    set({ pos: np })
    void load(queue[order[np]])
  },
  seek(t) {
    if (Number.isFinite(t)) audio.currentTime = t
  },
  setVolume(v) {
    audio.volume = v
    set({ volume: v, muted: false })
    audio.muted = false
    void useSettings.getState().update({ volume: v })
  },
  toggleMute() {
    audio.muted = !audio.muted
    set({ muted: audio.muted })
  },
  toggleShuffle() {
    const { shuffle, queue, order, pos } = get()
    if (!queue.length) return set({ shuffle: !shuffle })
    const currentIndex = order[pos]
    const newOrder = !shuffle ? shuffled(queue.length, currentIndex) : [...queue.keys()]
    set({ shuffle: !shuffle, order: newOrder, pos: !shuffle ? 0 : currentIndex })
  },
  cycleRepeat() {
    const r = get().repeat
    set({ repeat: r === 'off' ? 'all' : r === 'all' ? 'one' : 'off' })
  }
}))

onAudio('playing', () => {
  usePlayer.setState({ playing: true, loading: false })
  const { current, source } = usePlayer.getState()
  if (current) trackerStart(current, source ?? 'stream', audio.currentTime, audio.duration)
})
onAudio('pause', () => usePlayer.setState({ playing: false }))
onAudio('waiting', () => usePlayer.setState({ loading: true }))
onAudio('canplay', () => usePlayer.setState({ loading: false }))
onAudio('timeupdate', () => {
  usePlayer.setState({ time: audio.currentTime })
  trackerTime(audio.currentTime, !audio.paused, audio.duration)
  preloadNext()
})
onAudio('loadedmetadata', () => {
  if (pendingSeek !== null && Number.isFinite(audio.duration) && pendingSeek < audio.duration - 1) audio.currentTime = pendingSeek
  pendingSeek = null
})
onAudio('durationchange', () => {
  if (Number.isFinite(audio.duration)) usePlayer.setState({ duration: audio.duration })
})
onAudio('ended', () => {
  trackerFinish('ended')
  usePlayer.getState().next(true)
})
onAudio('seeked', () => {
  trackerSeeked(audio.currentTime)
  pushPresence()
})

/** Meldet den aktuellen Wiedergabezustand an den Hauptprozess (Discord Rich Presence). */
function pushPresence(): void {
  const { current, playing } = usePlayer.getState()
  if (!current) return window.ss.presence.update(null)
  window.ss.presence.update({
    trackId: current.trackId,
    releaseId: current.releaseId,
    title: current.title,
    version: current.version,
    artists: current.artistsTitle,
    artistUri: current.artists[0]?.uri || undefined,
    album: current.releaseTitle,
    coverUrl: releaseCover(current.releaseId, 512),
    playing,
    position: audio.currentTime || 0,
    duration: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : current.duration
  })
}

usePlayer.subscribe((s, prev) => {
  if (s.current?.trackId !== prev.current?.trackId || s.playing !== prev.playing) pushPresence()
  if (s.pos !== prev.pos || s.order !== prev.order || s.repeat !== prev.repeat) {
    prefetchAutoplay()
    // Nächster Track hat sich geändert (Warteschlange bearbeitet …) → falsch vorgeladenes verwerfen
    const next = upcomingTrack()
    if (standby.dataset.trackId && standby.dataset.trackId !== next?.trackId) resetStandby()
    preloadNext()
  }
  if (s.playing && !prev.playing) preloadNext()
  if (s.queue !== prev.queue || s.order !== prev.order || s.pos !== prev.pos || s.shuffle !== prev.shuffle || s.repeat !== prev.repeat) saveSession()
})
useSettings.subscribe((s, prev) => {
  if (s.settings?.autoplay !== prev.settings?.autoplay) prefetchAutoplay()
})

// ---------- Wiedergabe über Neustarts merken ----------

const SESSION_KEY = 'crate-ranger.playback.v1'
const MAX_SAVED_QUEUE = 500

interface SavedSession {
  queue: TrackLite[]
  order: number[]
  pos: number
  time: number
  shuffle: boolean
  repeat: Repeat
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let restoring = false

function writeSession(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  if (restoring) return
  const { queue, order, pos, current, shuffle, repeat } = usePlayer.getState()
  try {
    if (!current) return localStorage.removeItem(SESSION_KEY)
    // Sehr lange Warteschlangen (ganzer Katalog …) nur ab dem aktuellen Track speichern
    let session: SavedSession
    if (queue.length <= MAX_SAVED_QUEUE) {
      session = { queue, order, pos, time: audio.currentTime || usePlayer.getState().time, shuffle, repeat }
    } else {
      const rest = order.slice(pos, pos + MAX_SAVED_QUEUE).map((i) => queue[i])
      session = { queue: rest, order: rest.map((_, i) => i), pos: 0, time: audio.currentTime || usePlayer.getState().time, shuffle, repeat }
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    /* Speicher voll/gesperrt – Fortsetzen ist nur ein Komfort */
  }
}

function saveSession(): void {
  if (!saveTimer) saveTimer = setTimeout(writeSession, 500)
}

function readSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as SavedSession
    const valid =
      Array.isArray(s.queue) && s.queue.length > 0 && Array.isArray(s.order) && s.order.length === s.queue.length &&
      s.order.every((i) => Number.isInteger(i) && i >= 0 && i < s.queue.length) &&
      Number.isInteger(s.pos) && s.pos >= 0 && s.pos < s.order.length && s.queue.every((x) => x && typeof x.trackId === 'string')
    return valid ? s : null
  } catch {
    return null
  }
}

/** Letzte Wiedergabe wiederherstellen – pausiert an der gespeicherten Stelle, „Play“ hört direkt weiter. */
function restoreSession(): void {
  const s = readSession()
  if (!s) return
  const current = s.queue[s.order[s.pos]]
  const time = Math.max(0, Number(s.time) || 0)
  restoring = true
  usePlayer.setState({
    queue: s.queue,
    order: s.order,
    pos: s.pos,
    current,
    time,
    duration: current.duration,
    shuffle: !!s.shuffle,
    repeat: s.repeat === 'all' || s.repeat === 'one' ? s.repeat : 'off',
    playing: false
  })
  restoring = false
  resumeAt = { trackId: current.trackId, time }
  updateMediaSession(current)
}

// Position regelmäßig und beim Beenden sichern
let lastTimeSave = 0
onAudio('timeupdate', () => {
  const now = Date.now()
  if (now - lastTimeSave > 5000) {
    lastTimeSave = now
    saveSession()
  }
})
onAudio('pause', saveSession)
window.addEventListener('beforeunload', writeSession)
onAudio('error', () => {
  // Signierte Stream-URL abgelaufen o.ä. → einmal neu auflösen
  const { current, source } = usePlayer.getState()
  if (current && source === 'stream' && !audio.dataset.retried) {
    audio.dataset.retried = '1'
    void load(current, true, true).finally(() => delete audio.dataset.retried)
  } else {
    usePlayer.setState({ playing: false, loading: false })
  }
})

export function initPlayer(volume: number): void {
  for (const el of elements) el.volume = volume
  usePlayer.setState({ volume })
  restoreSession()
  if ('mediaSession' in navigator) {
    const p = (): PlayerState => usePlayer.getState()
    navigator.mediaSession.setActionHandler('play', () => p().toggle())
    navigator.mediaSession.setActionHandler('pause', () => p().toggle())
    navigator.mediaSession.setActionHandler('nexttrack', () => p().next())
    navigator.mediaSession.setActionHandler('previoustrack', () => p().prev())
    navigator.mediaSession.setActionHandler('seekto', (d) => d.seekTime !== undefined && p().seek(d.seekTime))
  }
}
