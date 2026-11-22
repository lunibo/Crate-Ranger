import {
  ByteVector,
  File as TagFile,
  FlacFile,
  Id3v2FrameClassType,
  Id3v2FrameIdentifiers,
  Id3v2Settings,
  Id3v2Tag,
  Id3v2UnsynchronizedLyricsFrame,
  Id3v2UserTextInformationFrame,
  Picture,
  PictureType,
  TagTypes,
  XiphComment
} from 'node-taglib-sharp'
import type { TrackMeta } from './meta'
import { withVersion } from './meta'

export interface CoverImage {
  data: Buffer
  mimeType: string
}

/**
 * Felder, die zusätzlich zu den Standard-Tags geschrieben werden (Vorbis-Name → Wert/Werte).
 * `keepEmpty`: leere Felder mitliefern, damit sie beim erneuten Taggen aus der Datei entfernt werden.
 */
export function customFields(m: TrackMeta, keepEmpty = false): Record<string, string[]> {
  const f: Record<string, string[]> = {
    DATE: m.releaseDate ? [m.releaseDate] : [],
    BPM: m.bpm ? [String(m.bpm)] : [],
    ARTISTS: m.artists,
    LABEL: m.label ? [m.label] : [],
    CATALOGNUMBER: m.catalogId ? [m.catalogId] : [],
    BARCODE: m.upc ? [m.upc] : [],
    MOOD: m.moods,
    RELEASETYPE: m.releaseType ? [m.releaseType.toLowerCase()] : [],
    LANGUAGE: m.lyricsLanguage ? [m.lyricsLanguage] : [],
    ITUNESADVISORY: [m.explicit ? '1' : '0'],
    SOUNDSCOUT_TRACK_ID: [m.trackId],
    SOUNDSCOUT_RELEASE_ID: [m.releaseId],
    SOUNDSCOUT_CREATOR_SAFE: [m.creatorSafe ? '1' : '0'],
    SOUNDSCOUT_PERFORMANCE: m.performanceType ? [m.performanceType] : [],
    SOUNDSCOUT_USAGES: m.usages,
    SOUNDSCOUT_INSTRUMENTS: m.instruments,
    SOUNDSCOUT_TAGS: m.otherTags,
    SOUNDSCOUT_URL: [`https://www.soundscout.com/player/music/${m.trackId}`]
  }
  if (!keepEmpty) for (const k of Object.keys(f)) if (!f[k].length) delete f[k]
  return f
}

function commentText(m: TrackMeta): string {
  const parts: string[] = []
  if (m.moods.length) parts.push(`Mood: ${m.moods.join(', ')}`)
  if (m.usages.length) parts.push(`Themes: ${m.usages.join(', ')}`)
  if (m.instruments.length) parts.push(`Instruments: ${m.instruments.join(', ')}`)
  if (m.otherTags.length) parts.push(`Tags: ${m.otherTags.join(', ')}`)
  parts.push(m.creatorSafe ? 'Copyright Safe (SoundScout)' : 'One-off license required (SoundScout)')
  return parts.join(' | ')
}

function setStandard(tag: TagFile['tag'], m: TrackMeta): void {
  tag.title = withVersion(m.title, m.version)
  tag.performers = [m.artistsTitle]
  tag.albumArtists = [m.releaseArtist]
  tag.album = withVersion(m.releaseTitle, m.releaseVersion)
  tag.track = m.trackNumber || 0
  tag.trackCount = m.trackTotal || 0
  tag.year = m.year ? Number(m.year) : 0
  tag.genres = m.genres
  tag.beatsPerMinute = m.bpm || 0
  tag.isrc = m.isrc || ''
  tag.publisher = m.label || ''
  tag.grouping = m.brand || ''
  tag.copyright = m.copyright || ''
  tag.initialKey = m.key || ''
  tag.comment = commentText(m)
  tag.lyrics = m.lyrics || ''
}

function writeXiph(x: XiphComment, m: TrackMeta): void {
  for (const [k, v] of Object.entries(customFields(m, true))) {
    if (v.length) x.setFieldAsStrings(k, ...v)
    else x.removeField(k)
  }
}

function writeId3(t: Id3v2Tag, m: TrackMeta): void {
  if (m.releaseDate) t.setTextFrame(Id3v2FrameIdentifiers.TDRC, m.releaseDate)
  if (m.moods.length) t.setTextFrame(Id3v2FrameIdentifiers.TMOO, m.moods.join('; '))
  if (m.lyricsLanguage) t.setTextFrame(Id3v2FrameIdentifiers.TLAN, m.lyricsLanguage)
  const existing = t.getFramesByClassType<Id3v2UserTextInformationFrame>(Id3v2FrameClassType.UserTextInformationFrame)
  const fields = customFields(m, true)
  for (const k of ['DATE', 'BPM', 'MOOD', 'LANGUAGE', 'LABEL']) delete fields[k] // bereits als Standard-Frames
  for (const [desc, values] of Object.entries(fields)) {
    let frame = Id3v2UserTextInformationFrame.findUserTextInformationFrame(existing, desc, false)
    if (!values.length) {
      if (frame) t.removeFrame(frame)
      continue
    }
    if (!frame) {
      frame = Id3v2UserTextInformationFrame.fromDescription(desc)
      t.addFrame(frame)
    }
    frame.text = values
  }
  t.removeFrames(Id3v2FrameIdentifiers.USLT)
  if (m.lyrics) {
    const lyr = Id3v2UnsynchronizedLyricsFrame.fromData('', 'eng')
    lyr.text = m.lyrics
    t.addFrame(lyr)
  }
}

export function makePicture(cover: CoverImage): Picture {
  return Picture.fromFullData(ByteVector.fromByteArray(cover.data), PictureType.FrontCover, cover.mimeType, '')
}

/**
 * Schreibt alle Metadaten in die Datei.
 * - FLAC: entfernt den nicht-standardkonformen ID3v2-Header der SoundScout-Dateien, schreibt Vorbis Comments.
 * - MP3/WAV: ID3v2.4 inkl. TXXX-Feldern.
 * Vorhandene Cover bleiben erhalten; fehlt eines, wird `cover` eingebettet.
 */
export function writeTags(path: string, m: TrackMeta, cover?: CoverImage | null): void {
  Id3v2Settings.defaultVersion = 4
  Id3v2Settings.forceDefaultVersion = true
  const file = TagFile.createFromPath(path)
  try {
    if (file instanceof FlacFile) {
      file.removeTags(TagTypes.Id3v2 | TagTypes.Id3v1 | TagTypes.Ape)
      const x = file.getTag(TagTypes.Xiph, true) as XiphComment
      setStandard(file.tag, m)
      writeXiph(x, m)
    } else {
      file.removeTags(TagTypes.Id3v1 | TagTypes.Ape)
      const t = file.getTag(TagTypes.Id3v2, true) as Id3v2Tag
      setStandard(file.tag, m)
      writeId3(t, m)
    }
    if (cover && file.tag.pictures.length === 0) file.tag.pictures = [makePicture(cover)]
    file.save()
  } finally {
    file.dispose()
  }
}

/** Erstes eingebettetes Bild (für cover.jpg). */
export function readEmbeddedPicture(path: string): CoverImage | null {
  const file = TagFile.createFromPath(path)
  try {
    const p = file.tag.pictures[0]
    return p ? { data: Buffer.from(p.data.toByteArray()), mimeType: p.mimeType } : null
  } finally {
    file.dispose()
  }
}

/** Liest die eingebettete SoundScout-Track-ID (für den Ordner-Scan). */
export function readSoundScoutIds(path: string): { trackId: string; releaseId: string; title: string; artist: string; album: string; albumArtist: string; track: number } | null {
  const file = TagFile.createFromPath(path)
  try {
    let trackId = ''
    let releaseId = ''
    const x = file.getTag(TagTypes.Xiph, false) as XiphComment | undefined
    if (x) {
      trackId = x.getFieldFirstValue('SOUNDSCOUT_TRACK_ID') ?? ''
      releaseId = x.getFieldFirstValue('SOUNDSCOUT_RELEASE_ID') ?? ''
    }
    const id3 = file.getTag(TagTypes.Id3v2, false) as Id3v2Tag | undefined
    if (!trackId && id3) {
      const frames = id3.getFramesByClassType<Id3v2UserTextInformationFrame>(Id3v2FrameClassType.UserTextInformationFrame)
      trackId = Id3v2UserTextInformationFrame.findUserTextInformationFrame(frames, 'SOUNDSCOUT_TRACK_ID', false)?.text[0] ?? ''
      releaseId = Id3v2UserTextInformationFrame.findUserTextInformationFrame(frames, 'SOUNDSCOUT_RELEASE_ID', false)?.text[0] ?? ''
    }
    if (!trackId) return null
    const t = file.tag
    return {
      trackId,
      releaseId,
      title: t.title ?? '',
      artist: t.performers[0] ?? '',
      album: t.album ?? '',
      albumArtist: t.albumArtists[0] ?? '',
      track: t.track ?? 0
    }
  } finally {
    file.dispose()
  }
}
