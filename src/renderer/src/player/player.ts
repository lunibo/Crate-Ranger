import { create } from 'zustand'
import { errorMessage, releaseCover, type TrackLite } from '../lib/api'
import { localFile, toast, useLibrary, useSettings } from '../lib/stores'
import { t } from '../lib/i18n'
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
  playList(tracks: TrackLite[], startIndex?: number): void
  jumpTo(pos: number): void
  playNext(track: TrackLite): void
  addToQueue(tracks: TrackLite[]): void
  toggle(): void
  next(auto?: boolean): void
  prev(): void
  seek(t: number): void
  setVolume(v: number): void
  toggleMute(): void
  toggleShuffle(): void
  cycleRepeat(): void
}

const audio = new Audio()
audio.preload = 'auto'

function shuffled(n: number, first: number): number[] {
  const rest = [...Array(n).keys()].filter((i) => i !== first)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return [first, ...rest]
}

let loadToken = 0

async function load(track: TrackLite, autoplay = true, forceResolve = false): Promise<void> {
  const token = ++loadToken
  if (!forceResolve) trackerFinish('switch') // Neustart/Trackwechsel = neue Wiedergabe; Neuversuch nicht
  usePlayer.setState({ current: track, loading: true, time: 0, duration: track.duration })
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
  playNext(track) {
    const { queue, order, pos, current } = get()
    if (!current) return get().playList([track])
    const q = [...queue, track]
    const o = [...order]
    o.splice(pos + 1, 0, q.length - 1)
    set({ queue: q, order: o })
    toast('info', t('player.playingNext', { title: track.title }))
  },
  addToQueue(tracks) {
    const { queue, order, current } = get()
    if (!current) return get().playList(tracks)
    const start = queue.length
    set({ queue: [...queue, ...tracks], order: [...order, ...tracks.map((_, i) => start + i)] })
    toast('info', t('player.addedToQueue', { count: tracks.length }))
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
      if (repeat === 'all' || !auto) np = 0
      else {
        set({ playing: false })
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

audio.addEventListener('playing', () => {
  usePlayer.setState({ playing: true, loading: false })
  const { current, source } = usePlayer.getState()
  if (current) trackerStart(current, source ?? 'stream', audio.currentTime, audio.duration)
})
audio.addEventListener('pause', () => usePlayer.setState({ playing: false }))
audio.addEventListener('waiting', () => usePlayer.setState({ loading: true }))
audio.addEventListener('canplay', () => usePlayer.setState({ loading: false }))
audio.addEventListener('timeupdate', () => {
  usePlayer.setState({ time: audio.currentTime })
  trackerTime(audio.currentTime, !audio.paused, audio.duration)
})
audio.addEventListener('durationchange', () => {
  if (Number.isFinite(audio.duration)) usePlayer.setState({ duration: audio.duration })
})
audio.addEventListener('ended', () => {
  trackerFinish('ended')
  usePlayer.getState().next(true)
})
audio.addEventListener('seeked', () => {
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
})
audio.addEventListener('error', () => {
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
  audio.volume = volume
  usePlayer.setState({ volume })
  if ('mediaSession' in navigator) {
    const p = (): PlayerState => usePlayer.getState()
    navigator.mediaSession.setActionHandler('play', () => p().toggle())
    navigator.mediaSession.setActionHandler('pause', () => p().toggle())
    navigator.mediaSession.setActionHandler('nexttrack', () => p().next())
    navigator.mediaSession.setActionHandler('previoustrack', () => p().prev())
    navigator.mediaSession.setActionHandler('seekto', (d) => d.seekTime !== undefined && p().seek(d.seekTime))
  }
}
