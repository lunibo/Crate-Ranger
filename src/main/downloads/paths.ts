import { join } from 'node:path'
import type { TrackMeta } from './meta'
import { withVersion } from './meta'

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i
const MAX_SEGMENT = 120
const MAX_PATH = 240

/** Macht einen einzelnen Pfadbestandteil Windows-tauglich. */
export function sanitizeSegment(input: string, maxLen = MAX_SEGMENT): string {
  let s = input
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/|]/g, '-')
    .replace(/:/g, ' -')
    .replace(/"/g, "'")
    .replace(/[<>?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (s.length > maxLen) s = s.slice(0, maxLen).trim()
  s = s.replace(/[. ]+$/g, '')
  if (!s) s = '_'
  if (RESERVED.test(s.split('.')[0])) s = `${s}_`
  return s
}

/** Entfernt leere Klammern und Reste wie " - " am Rand nach dem Einsetzen leerer Platzhalter. */
function tidy(s: string): string {
  return s
    .replace(/\[\s*\]|\(\s*\)/g, '')
    .replace(/\s+-\s*$/g, '')
    .replace(/^\s*-\s+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function templateValues(m: TrackMeta, ext: string): Record<string, string> {
  const sameArtist = m.artistsTitle.toLowerCase() === m.releaseArtist.toLowerCase()
  const titleV = withVersion(m.title, m.version)
  return {
    releaseArtist: m.releaseArtist || m.artistsTitle || 'Unknown Artist',
    trackArtist: m.artistsTitle,
    year: m.year || '0000',
    releaseTitle: withVersion(m.releaseTitle || m.title, m.releaseVersion),
    catalogId: m.catalogId,
    trackNo: String(m.trackNumber || 0).padStart(2, '0'),
    title: m.title,
    version: m.version,
    trackTitle: sameArtist || !m.artistsTitle ? titleV : `${m.artistsTitle} - ${titleV}`,
    brand: m.brand,
    releaseType: m.releaseType,
    label: m.label,
    ext
  }
}

/** Baut den Zielpfad aus Template + Metadaten. Platzhalter: {releaseArtist} {year} {releaseTitle} … */
export function buildTrackPath(root: string, template: string, m: TrackMeta, ext: string): string {
  const values = templateValues(m, ext)
  const rawSegments = template.split(/[\\/]+/).filter(Boolean)
  const segments = rawSegments.map((seg) =>
    sanitizeSegment(tidy(seg.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')))
  )
  let fileBase = segments.pop() ?? sanitizeSegment(values.trackTitle)
  const assemble = (): string => join(root, ...segments, `${fileBase}.${ext}`)
  // Zu lange Pfade: jeweils den längsten Bestandteil kürzen, bis es passt (min. 20 Zeichen).
  let full = assemble()
  for (let guard = 0; full.length > MAX_PATH && guard < 50; guard++) {
    const parts = [...segments, fileBase]
    const longest = parts.reduce((iMax, p, i, arr) => (p.length > arr[iMax].length ? i : iMax), 0)
    if (parts[longest].length <= 20) break
    const cut = Math.min(full.length - MAX_PATH, parts[longest].length - 20)
    const shortened = sanitizeSegment(parts[longest], parts[longest].length - Math.max(1, cut))
    if (longest === parts.length - 1) fileBase = shortened
    else segments[longest] = shortened
    full = assemble()
  }
  return full
}
