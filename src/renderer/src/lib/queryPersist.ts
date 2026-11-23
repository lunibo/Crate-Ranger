// Katalogdaten (Releases, Tracks, Artists, Genres …) über App-Neustarts behalten:
// Seiten öffnen sofort mit den gespeicherten Daten und aktualisieren sich im Hintergrund.
// Persönliches (Favoriten, eigene Playlists, Statistik, Suche) wird bewusst nicht gespeichert.
import { dehydrate, hydrate, type DehydratedState, type Query, type QueryClient } from '@tanstack/react-query'

/** Nur diese Abfragen (erstes Element des queryKey) werden gespeichert */
export const PERSISTED_KEYS = new Set([
  'release', 'release-tracks', 'release-artists',
  'track', 'track-artists', 'similar',
  'artist', 'artists', 'artist-releases', 'artist-releases-by-id', 'artist-catalog', 'artist-appears',
  'releases-all', 'home-releases', 'home-popular', 'home-playlists', 'public-playlists',
  'tag-dist', 'genre-dist', 'explore'
])
/** Ältere Einträge werden beim Start verworfen */
export const PERSIST_MAX_AGE_MS = 7 * 24 * 3600_000
export const PERSIST_MAX_ENTRIES = 3000

const DB_NAME = 'crate-ranger-cache'
const STORE = 'queries'

type DehydratedQuery = DehydratedState['queries'][number]
interface Row {
  hash: string
  savedAt: number
  query: DehydratedQuery
}

export function shouldPersist(query: Pick<Query, 'queryKey' | 'state'>): boolean {
  const k = query.queryKey[0]
  return typeof k === 'string' && PERSISTED_KEYS.has(k) && query.state.status === 'success' && query.state.data !== undefined
}

/** „Mehr laden“-Listen nur mit der ersten Seite speichern (sonst lädt der Neustart alle Seiten nach) */
export function trimInfinite<T>(data: T): T {
  const d = data as { pages?: unknown[]; pageParams?: unknown[] }
  if (d && Array.isArray(d.pages) && Array.isArray(d.pageParams) && d.pages.length > 1) {
    return { ...d, pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) } as T
  }
  return data
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'hash' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })

let dbPromise: Promise<IDBDatabase> | null = null
const db = (): Promise<IDBDatabase> => (dbPromise ??= openDb())

/** Gespeicherte Abfragen laden (vor dem ersten Rendern), Abgelaufenes aufräumen. */
export async function restoreQueries(client: QueryClient, now = Date.now()): Promise<number> {
  try {
    const d = await db()
    const tx = d.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const rows = await new Promise<Row[]>((resolve, reject) => {
      const r = store.getAll()
      r.onsuccess = () => resolve(r.result as Row[])
      r.onerror = () => reject(r.error)
    })
    const fresh: Row[] = []
    for (const row of rows) {
      const k = row.query?.queryKey?.[0]
      if (now - row.savedAt > PERSIST_MAX_AGE_MS || typeof k !== 'string' || !PERSISTED_KEYS.has(k)) store.delete(row.hash)
      else fresh.push(row)
    }
    // Zu viele → älteste löschen
    fresh.sort((a, b) => b.savedAt - a.savedAt)
    for (const row of fresh.splice(PERSIST_MAX_ENTRIES)) store.delete(row.hash)
    await done(tx)
    hydrate(client, { mutations: [], queries: fresh.map((r) => r.query) })
    return fresh.length
  } catch {
    return 0 // IndexedDB nicht verfügbar → einfach ohne gespeicherte Daten starten
  }
}

/** Erfolgreich geladene Abfragen laufend (gebündelt) speichern. */
export function persistQueries(client: QueryClient): () => void {
  const pending = new Map<string, Query>()
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = async (): Promise<void> => {
    timer = null
    const batch = [...pending.values()]
    pending.clear()
    if (!batch.length) return
    try {
      const state = dehydrate(client, { shouldDehydrateQuery: (q) => batch.includes(q) })
      const d = await db()
      const tx = d.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const now = Date.now()
      for (const q of state.queries) {
        store.put({ hash: q.queryHash, savedAt: now, query: { ...q, state: { ...q.state, data: trimInfinite(q.state.data) } } } satisfies Row)
      }
      await done(tx)
    } catch {
      /* Speichern ist nur ein Komfort */
    }
  }
  const unsub = client.getQueryCache().subscribe((e) => {
    if (e.type !== 'updated' || e.action.type !== 'success' || !shouldPersist(e.query)) return
    pending.set(e.query.queryHash, e.query)
    timer ??= setTimeout(() => void flush(), 1000)
  })
  window.addEventListener('beforeunload', () => void flush())
  return unsub
}

/** Alle gespeicherten Abfragen löschen (Einstellungen → Cache leeren). */
export async function clearPersistedQueries(): Promise<void> {
  try {
    const d = await db()
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    await done(tx)
  } catch {
    /* ignorieren */
  }
}

/** Ungefähre Größe der gespeicherten Daten in Bytes (für die Anzeige in den Einstellungen). */
export async function persistedQueriesSize(): Promise<{ count: number; bytes: number }> {
  try {
    const d = await db()
    const rows = await new Promise<Row[]>((resolve, reject) => {
      const r = d.transaction(STORE, 'readonly').objectStore(STORE).getAll()
      r.onsuccess = () => resolve(r.result as Row[])
      r.onerror = () => reject(r.error)
    })
    return { count: rows.length, bytes: rows.reduce((n, r) => n + JSON.stringify(r.query).length, 0) }
  } catch {
    return { count: 0, bytes: 0 }
  }
}
