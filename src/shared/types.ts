// ---------- SoundScout API (Antwortformate, live verifiziert) ----------

export interface Genre {
  ID: string
  Title: string
  TrackCount?: number
  PreferredImageFileID?: string | null
  TopReleases?: { ID: string; CoverFileID: string }[] | null
}

export interface TrackArtist {
  ID: string
  Name: string
  URL: string // = Artist-URI
  Role: string
}

/** Zeile aus /catalog (Track + Release-Felder). Ohne `columns` fehlen Artists/LabelTitle. */
export interface CatalogTrack {
  TrackID: string
  Title: string
  Version: string
  ArtistsTitle: string
  Artists?: TrackArtist[] | null
  BPM?: number
  PublicBPM?: number | null
  Duration?: number
  PublicDuration?: number | null
  ISRC?: string | null
  Genres?: Genre[] | null
  ReleaseGenres?: Genre[] | null
  Tags?: string[] | null
  IsExplicit?: boolean
  IsCreatorFriendly?: boolean
  IsFavorite?: boolean
  Lyrics?: string
  LyricsLanguage?: string
  PerformanceType?: string
  LabelID?: string
  LabelTitle?: string | null
  BrandTitle?: string | null
  PreferredImageFileID?: string | null
  TrackNumber?: number
  ReleaseID: string
  ReleaseTitle?: string
  ReleaseVersion?: string
  ReleaseArtistsTitle?: string
  ReleaseDate?: string
  ReleaseDateTimezone?: string
  ReleaseType?: string
  ReleaseCatalogID?: string
  ReleaseUPC?: string
  ReleaseCopyrightPLine?: string
  ReleaseCoverFileID?: string
}

export interface Release {
  ID: string
  Title: string
  Version: string
  ArtistsTitle: string
  CatalogID: string
  CopyrightPLine: string
  CoverFileID: string
  Description: string
  Genres: Genre[]
  ReleaseDate: string
  ReleaseDateTimezone?: string
  Type: string
  UPC: string
}

export interface ReleaseArtist {
  ReleaseID: string
  ArtistID: string
  Role: string
  ArtistNumber: number
  DisplayName: string
}

export interface Artist {
  ID: string
  Name: string
  URI: string
  Description?: string
  Links?: { Platform: string; URL: string }[] | null
  Images?: Record<string, unknown> | null
  Hidden?: boolean
}

export interface Playlist {
  ID: string
  Name: string
  Public: boolean
  CoverImageIDs?: string[] | null
  CallerRole?: string
  IsFavorite?: boolean
  FollowerCount?: number
  TrackCount?: number | null
  CreatedAt?: string
  UpdatedAt?: string
}

export interface PlaylistItem {
  PlaylistID: string
  TrackID: string
  Sort: number
  Track: CatalogTrack
}

export interface ListResponse<T> {
  Data: T[] | null
  Limit: number
  Offset: number
  Total: number
}

export interface SearchResponse extends ListResponse<CatalogTrack> {
  QueryID: string
}

export interface NameEntity {
  ID: string
  Name: string
  Type: string
  URI: string
  Version: string
  ArtistsTitle: string
  ReleaseType: string
  ReleaseDate: string | null
  Image?: { Kind: string; FileID: string; HasImage: boolean }
}

export interface NameGroup {
  Kind: 'artist' | 'release' | 'playlist' | 'genre' | 'mood' | 'theme' | 'track' | string
  Total: number
  Entities: NameEntity[] | null
  Tracks: CatalogTrack[] | null
}

export interface NamesResponse {
  NameMatches: { Best: NameEntity | null; BestExact: boolean; Groups: NameGroup[] | null } | null
}

export interface TagDistribution {
  Tag: string
  Category: string
  TrackCount: number
}

export interface GenreDistribution {
  ID: string
  Title: string
  TrackCount: number
}

export interface LabelDistribution {
  LabelID: string
  LabelTitle: string
  BrandTitle: string
  TrackCount: number
}

export interface TagInfo {
  ID: number
  Tag: string
  Category: string
  PreferredImageFileID?: string | null
  TopReleases?: { ID: string; CoverFileID: string }[] | null
}

// ---------- Auth ----------

export interface AuthState {
  loggedIn: boolean
  tier?: string
  planName?: string
  subscriptionStatus?: string
  periodEnd?: string
  downloadsAllowed: boolean
  error?: string
}

// ---------- Settings ----------

export type DownloadFormat = 'FLAC' | 'MP3_320' | 'WAV'

export const FORMAT_EXT: Record<DownloadFormat, string> = { FLAC: 'flac', MP3_320: 'mp3', WAV: 'wav' }
export const FORMAT_LABEL: Record<DownloadFormat, string> = { FLAC: 'FLAC', MP3_320: 'MP3 320', WAV: 'WAV' }

export interface Settings {
  downloadRoot: string
  format: DownloadFormat
  pathTemplate: string
  concurrency: number
  skipExisting: boolean
  saveCoverFile: boolean
  volume: number
  /** „system“ oder Sprachcode (z.B. „de“, „en“) */
  language: string
  /** Discord Rich Presence („Hört SoundScout“) */
  discordEnabled: boolean
  /** Hörstatistiken lokal sammeln (für Field Report) */
  statsEnabled: boolean
  /** Endlos hören: am Ende der Warteschlange ähnliche Tracks weiterspielen. null = noch nie entschieden (→ einmalige Nachfrage) */
  autoplay: boolean | null
  /** Beim Start auf GitHub nach neuen Versionen suchen. null = noch nie gefragt (→ Nachfrage beim ersten Start) */
  updateCheck: boolean | null
}

export interface UpdateState {
  status: 'idle' | 'checking' | 'current' | 'available' | 'error'
  currentVersion: string
  latestVersion?: string
  /** Release-Seite auf GitHub */
  url?: string
  checkedAt?: number
  error?: string
}

// ---------- Hörstatistiken (lokal) ----------

/** Eine Wiedergabe – kompakt gespeichert (eine JSON-Zeile pro Wiedergabe). */
export interface PlayRecord {
  id: string
  /** Start (ms seit Epoch) */
  at: number
  /** tatsächlich gehörte Zeit in ms (ohne Spulen) */
  ms: number
  /** Tracklänge in s */
  dur: number
  t: string
  r: string
  ti: string
  v: string
  a: string
  ar: { id: string; name: string; uri: string }[]
  al: string
  g: string[]
  tg: string[]
  bpm: number
  br: string
  rd: string
  cs: boolean
  src: 'stream' | 'local'
  /** bis (fast) zum Ende gehört */
  done: boolean
  /** früh übersprungen (< 30 s, per Weiter/Trackwechsel) */
  skip: boolean
}

export type StatEventType = 'favorite' | 'unfavorite' | 'search' | 'ai-search' | 'session'

export interface StatEvent {
  at: number
  type: StatEventType
  /** Track-ID (Favoriten) oder Suchbegriff */
  ref?: string
  /** Dauer in ms (App-Sitzung) */
  ms?: number
}

export interface StatsData {
  plays: PlayRecord[]
  events: StatEvent[]
  downloads: { at: number; trackId: string }[]
}

// ---------- Discord Rich Presence ----------

export interface PresenceTrack {
  trackId: string
  releaseId: string
  title: string
  version: string
  artists: string
  /** URI des (ersten) Artists für den Link zur Artist-Seite */
  artistUri?: string
  album: string
  coverUrl?: string
  playing: boolean
  /** Sekunden */
  position: number
  /** Sekunden */
  duration: number
}

export interface PresenceStatus {
  state: 'disabled' | 'missing-client-id' | 'connecting' | 'connected' | 'not-running' | 'error'
  user?: string
  error?: string
}

export const DEFAULT_PATH_TEMPLATE =
  '{releaseArtist}/{year} - {releaseTitle} [{catalogId}]/{trackNo} - {trackTitle}'

// ---------- Downloads ----------

export type JobStatus = 'queued' | 'preparing' | 'downloading' | 'tagging' | 'done' | 'skipped' | 'error' | 'cancelled'

export interface DownloadJob {
  id: string
  trackId: string
  releaseId: string
  title: string
  artist: string
  releaseTitle?: string
  format: DownloadFormat
  status: JobStatus
  loaded: number
  total: number
  attempts: number
  force?: boolean
  error?: string
  errorCode?: string
  path?: string
  addedAt: number
  finishedAt?: number
}

export interface QueueState {
  jobs: DownloadJob[]
  paused: boolean
  pauseReason?: string
  retryAt?: number
}

export interface EnqueueTrack {
  trackId: string
  releaseId: string
  title: string
  artist: string
  releaseTitle?: string
  /** ISO-Zeitpunkt des Releases – Pre-Releases werden nicht eingereiht */
  releaseDate?: string
}

export interface EnqueueResult {
  added: number
  /** Übersprungen, weil noch nicht veröffentlicht */
  skippedPreRelease: number
  /** Frühester Zeitpunkt, ab dem übersprungene Tracks verfügbar sind */
  availableFrom?: string
}

// ---------- Download-Kontingent (Schätzung) ----------

export interface QuotaInfo {
  /** null = kein bekanntes Limit (Jahresplan/unbekannt) */
  limit: number | null
  /** Downloads dieser App im aktuellen Abrechnungszeitraum */
  used: number
  remaining: number | null
  periodStart?: string
  periodEnd?: string
  billingPeriod?: string
  planName?: string
  /** Server hat download.monthly_limit gemeldet */
  limitReached?: { at: number; message: string }
}

// ---------- Library ----------

export interface LibraryFile {
  format: DownloadFormat
  path: string
  size: number
  downloadedAt: number
  missing?: boolean
}

export interface LibraryTrack {
  trackId: string
  releaseId: string
  title: string
  artist: string
  releaseTitle: string
  releaseArtist: string
  trackNumber: number
  files: LibraryFile[]
}

export interface LibraryRelease {
  releaseId: string
  title: string
  artist: string
  year: string
  catalogId: string
  type: string
  trackTotal: number
  coverFileId?: string
}

export interface LibrarySnapshot {
  tracks: Record<string, LibraryTrack>
  releases: Record<string, LibraryRelease>
}

export interface LibraryRefreshProgress {
  done: number
  total: number
  current?: string
}

export interface LibraryRefreshResult {
  total: number
  retagged: number
  moved: number
  failed: number
  errors: { path: string; error: string }[]
}

export interface ScanResult {
  scanned: number
  added: number
  missing: number
}

// ---------- IPC-API für den Renderer (window.ss) ----------

export type ApiParams = Record<string, string | number | boolean | (string | number)[] | undefined | null>

/** Größe der Zwischenspeicher (Einstellungen → Cache) */
export interface CacheInfo {
  coverBytes: number
  coverCount: number
  /** Chromium-HTTP-Cache der Sitzung (Skripte, alte Bildantworten, Stream-Puffer) */
  httpBytes: number
}

export interface SsBridge {
  api: {
    get<T = unknown>(path: string, params?: ApiParams): Promise<T>
    post<T = unknown>(path: string, body?: unknown, params?: ApiParams): Promise<T>
  }
  auth: {
    state(): Promise<AuthState>
    login(): Promise<AuthState>
    importSession(cookieValue: string): Promise<AuthState>
    openBrowserLogin(): Promise<void>
    logout(): Promise<AuthState>
  }
  player: {
    resolve(trackId: string, force?: boolean): Promise<string>
    localUrl(path: string): string
  }
  downloads: {
    enqueueTracks(tracks: EnqueueTrack[], format?: DownloadFormat, force?: boolean): Promise<EnqueueResult>
    enqueueRelease(releaseId: string, format?: DownloadFormat, force?: boolean): Promise<EnqueueResult>
    enqueuePlaylist(playlistId: string, format?: DownloadFormat, force?: boolean): Promise<EnqueueResult>
    state(): Promise<QueueState>
    pause(): Promise<void>
    resume(): Promise<void>
    cancel(jobId: string): Promise<void>
    retry(jobId?: string): Promise<void>
    clearFinished(): Promise<void>
    onUpdate(cb: (s: QueueState) => void): () => void
    quota(): Promise<QuotaInfo>
    onQuota(cb: (q: QuotaInfo) => void): () => void
  }
  cache: {
    info(): Promise<CacheInfo>
    /** Cover-Cache und Chromium-HTTP-Cache leeren (heruntergeladene Tracks bleiben) */
    clear(): Promise<void>
  }
  stats: {
    /** laufende Wiedergabe melden (final = abgeschlossen) */
    play(record: PlayRecord, final: boolean): void
    event(e: Omit<StatEvent, 'at'>): void
    get(): Promise<StatsData>
    clear(): Promise<void>
  }
  update: {
    state(): Promise<UpdateState>
    /** sofort prüfen (auch ohne Zustimmung beim Start – nur auf ausdrücklichen Klick) */
    check(): Promise<UpdateState>
    onState(cb: (s: UpdateState) => void): () => void
  }
  presence: {
    update(track: PresenceTrack | null): void
    status(): Promise<PresenceStatus>
    onStatus(cb: (s: PresenceStatus) => void): () => void
  }
  library: {
    snapshot(): Promise<LibrarySnapshot>
    verify(): Promise<ScanResult>
    scan(): Promise<ScanResult>
    remove(trackId: string, deleteFiles: boolean): Promise<void>
    /** Tags neu schreiben und Dateien nach aktuellem Ordner-Template einsortieren (kein Download). */
    refresh(): Promise<LibraryRefreshResult>
    onRefreshProgress(cb: (p: LibraryRefreshProgress) => void): () => void
    onUpdate(cb: (s: LibrarySnapshot) => void): () => void
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    chooseFolder(): Promise<string | null>
    previewPath(template: string): Promise<string>
  }
  shell: {
    showItem(path: string): Promise<void>
    openPath(path: string): Promise<void>
    openExternal(url: string): Promise<void>
  }
}
