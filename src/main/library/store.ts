import { existsSync, statSync, unlinkSync } from 'node:fs'
import type { DownloadFormat, LibraryFile, LibraryRelease, LibrarySnapshot, LibraryTrack } from '@shared/types'
import { releaseProgress } from '@shared/libraryProgress'
import { debounced, readJson, writeJsonAtomic } from '../jsonFile'

interface LibraryFileV1 extends LibrarySnapshot {
  version: 1
}

export type ReleaseStatus = 'none' | 'partial' | 'complete'

/** Merkt sich, welche Tracks (in welchem Format, wo) heruntergeladen wurden. */
export class LibraryStore {
  private data: LibraryFileV1
  private listeners = new Set<(s: LibrarySnapshot) => void>()
  private saver = debounced(() => this.persist(), 500)
  private notifier = debounced(() => this.emit(), 150)

  constructor(private readonly file: string) {
    const raw = readJson<Partial<LibraryFileV1>>(file, {})
    this.data = { version: 1, tracks: raw.tracks ?? {}, releases: raw.releases ?? {}, links: raw.links ?? {} }
    // Ältere Einträge: Dateien gehören zum Release des Tracks
    for (const t of Object.values(this.data.tracks)) {
      for (const f of t.files) {
        f.releaseId ??= t.releaseId
        f.trackNumber ??= t.trackNumber
      }
    }
  }

  snapshot(): LibrarySnapshot {
    return { tracks: this.data.tracks, releases: this.data.releases, links: this.data.links }
  }

  onChange(cb: (s: LibrarySnapshot) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(): void {
    const s = this.snapshot()
    for (const l of this.listeners) l(s)
  }

  private changed(): void {
    this.saver.schedule()
    this.notifier.schedule()
  }

  private persist(): void {
    writeJsonAtomic(this.file, this.data)
  }

  flush(): void {
    this.saver.flush()
  }

  getTrack(trackId: string): LibraryTrack | undefined {
    return this.data.tracks[trackId]
  }

  /** Vorhandene (nicht fehlende) Datei eines Tracks, optional in einem bestimmten Format und für ein bestimmtes Release. */
  existingFile(trackId: string, format?: DownloadFormat, releaseId?: string): LibraryFile | undefined {
    const t = this.data.tracks[trackId]
    return t?.files.find(
      (f) => !f.missing && (!format || f.format === format) && (!releaseId || f.releaseId === releaseId) && existsSync(f.path)
    )
  }

  upsertRelease(r: LibraryRelease): void {
    const prev = this.data.releases[r.releaseId]
    this.data.releases[r.releaseId] = { ...prev, ...r, trackTotal: r.trackTotal || prev?.trackTotal || 0 }
    this.changed()
  }

  /**
   * Ordnet vorhandene Tracks, die unter einem anderen Release gespeichert sind, zusätzlich diesem zu.
   * Tracks, die direkt unter dem Release liegen oder nicht in der Bibliothek sind, werden ignoriert.
   */
  linkRelease(releaseId: string, trackIds: string[], trackTotal = 0): void {
    const links = (this.data.links ??= {})
    const prev = links[releaseId]
    const ids = new Set(prev?.trackIds ?? [])
    const before = ids.size
    for (const id of trackIds) {
      const t = this.data.tracks[id]
      if (t && t.releaseId !== releaseId) ids.add(id)
    }
    const total = trackTotal || prev?.trackTotal || 0
    if (!ids.size || (ids.size === before && total === (prev?.trackTotal ?? 0))) return
    links[releaseId] = { trackIds: [...ids], trackTotal: total }
    this.changed()
  }

  /**
   * Trägt eine Datei ein. Pro Release und Format gibt es eine Datei; Dateien anderer Releases bleiben erhalten.
   * Hat der Track bereits eine Datei unter seinem bisherigen Release, bleibt dieses das Haupt-Release
   * und die neue Datei zählt als zusätzliche Kopie.
   */
  addFile(track: Omit<LibraryTrack, 'files'>, file: LibraryFile): void {
    const prev = this.data.tracks[track.trackId]
    const entry: LibraryFile = { ...file, releaseId: track.releaseId, trackNumber: track.trackNumber }
    const files = (prev?.files ?? []).filter(
      (f) => f.path !== entry.path && !(f.format === entry.format && f.releaseId === entry.releaseId)
    )
    files.push(entry)
    const keepPrimary = !!prev && prev.releaseId !== track.releaseId && files.some((f) => f.releaseId === prev.releaseId && !f.missing)
    this.data.tracks[track.trackId] = keepPrimary ? { ...prev, files } : { ...prev, ...track, files }
    if (keepPrimary) this.linkRelease(track.releaseId, [track.trackId])
    this.changed()
  }

  remove(trackId: string, deleteFiles: boolean): void {
    const t = this.data.tracks[trackId]
    if (!t) return
    if (deleteFiles) {
      for (const f of t.files) {
        try {
          if (existsSync(f.path)) unlinkSync(f.path)
        } catch {
          /* gesperrt o.ä. */
        }
      }
    }
    delete this.data.tracks[trackId]
    this.changed()
  }

  /** Prüft alle bekannten Dateien auf Existenz und markiert fehlende. */
  verify(): { checked: number; missing: number } {
    let checked = 0
    let missing = 0
    for (const t of Object.values(this.data.tracks)) {
      for (const f of t.files) {
        checked++
        const exists = existsSync(f.path)
        if (exists && f.missing) {
          f.missing = false
          try {
            f.size = statSync(f.path).size
          } catch {
            /* ignore */
          }
        }
        if (!exists) {
          f.missing = true
          missing++
        }
      }
    }
    this.changed()
    return { checked, missing }
  }

  releaseStatus(releaseId: string): { downloaded: number; total: number; status: ReleaseStatus } {
    const { done: downloaded, total } = releaseProgress(this.snapshot(), releaseId)
    const status: ReleaseStatus = downloaded === 0 ? 'none' : total > 0 && downloaded >= total ? 'complete' : 'partial'
    return { downloaded, total, status }
  }
}
