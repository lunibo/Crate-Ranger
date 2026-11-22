import { existsSync, statSync, unlinkSync } from 'node:fs'
import type { DownloadFormat, LibraryFile, LibraryRelease, LibrarySnapshot, LibraryTrack } from '@shared/types'
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
    this.data = { version: 1, tracks: raw.tracks ?? {}, releases: raw.releases ?? {} }
  }

  snapshot(): LibrarySnapshot {
    return { tracks: this.data.tracks, releases: this.data.releases }
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

  /** Vorhandene (nicht fehlende) Datei eines Tracks, optional in einem bestimmten Format. */
  existingFile(trackId: string, format?: DownloadFormat): LibraryFile | undefined {
    const t = this.data.tracks[trackId]
    return t?.files.find((f) => !f.missing && (!format || f.format === format) && existsSync(f.path))
  }

  upsertRelease(r: LibraryRelease): void {
    const prev = this.data.releases[r.releaseId]
    this.data.releases[r.releaseId] = { ...prev, ...r, trackTotal: r.trackTotal || prev?.trackTotal || 0 }
    this.changed()
  }

  addFile(track: Omit<LibraryTrack, 'files'>, file: LibraryFile): void {
    const prev = this.data.tracks[track.trackId]
    const files = (prev?.files ?? []).filter((f) => f.path !== file.path && f.format !== file.format)
    files.push(file)
    this.data.tracks[track.trackId] = { ...prev, ...track, files }
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
    const total = this.data.releases[releaseId]?.trackTotal ?? 0
    const downloaded = Object.values(this.data.tracks).filter(
      (t) => t.releaseId === releaseId && t.files.some((f) => !f.missing)
    ).length
    const status: ReleaseStatus = downloaded === 0 ? 'none' : total > 0 && downloaded >= total ? 'complete' : 'partial'
    return { downloaded, total, status }
  }
}
