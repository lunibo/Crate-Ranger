import { readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { DownloadFormat, ScanResult } from '@shared/types'
import { readSoundScoutIds } from '../downloads/tagger'
import type { LibraryStore } from './store'

const EXT_FORMAT: Record<string, DownloadFormat> = { '.flac': 'FLAC', '.mp3': 'MP3_320', '.wav': 'WAV' }

async function* walk(dir: string): AsyncGenerator<string> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (e.isFile() && EXT_FORMAT[extname(e.name).toLowerCase()] && !e.name.includes('.partial.')) yield p
  }
}

/**
 * Durchsucht den Download-Ordner nach Audiodateien mit eingebetteter SOUNDSCOUT_TRACK_ID
 * und trägt sie in den Index ein (z.B. nach Neuinstallation oder verschobenen Ordnern).
 */
export async function scanFolder(root: string, store: LibraryStore): Promise<ScanResult> {
  let scanned = 0
  let added = 0
  for await (const path of walk(root)) {
    scanned++
    const format = EXT_FORMAT[extname(path).toLowerCase()]
    try {
      const ids = readSoundScoutIds(path)
      if (!ids) continue
      const found = store.getTrack(ids.trackId)
      if (found?.files.some((f) => f.path === path && !f.missing)) continue
      const st = await stat(path)
      // Kopie für ein anderes Release → Angaben aus der Datei, nicht vom Haupt-Release übernehmen
      const known = found && (!ids.releaseId || found.releaseId === ids.releaseId) ? found : undefined
      store.addFile(
        {
          trackId: ids.trackId,
          releaseId: ids.releaseId || found?.releaseId || '',
          title: known?.title || ids.title,
          artist: known?.artist || ids.artist,
          releaseTitle: known?.releaseTitle || ids.album,
          releaseArtist: known?.releaseArtist || ids.albumArtist,
          trackNumber: known?.trackNumber || ids.track
        },
        { format, path, size: st.size, downloadedAt: st.mtimeMs }
      )
      added++
    } catch {
      /* defekte/gesperrte Datei überspringen */
    }
    if (scanned % 25 === 0) await new Promise((r) => setImmediate(r))
  }
  const { missing } = store.verify()
  return { scanned, added, missing }
}
