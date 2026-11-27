const FEAT_RE = /\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i

/** „Stonebank feat. EMEL“ → „Stonebank“ (Featured-Artists entfernen, Reihenfolge bleibt). */
export function stripFeaturing(artist: string): string {
  return artist.replace(FEAT_RE, '').trim()
}
