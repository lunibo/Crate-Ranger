/**
 * Spaltenlisten für /catalog. Die API liefert `Artists` und `LabelTitle` nur,
 * wenn sie explizit per `columns=` angefordert werden (live verifiziert).
 */
export const TRACK_LIST_COLUMNS = [
  'TrackID', 'Title', 'Version', 'Artists', 'ArtistsTitle', 'PublicDuration', 'PublicBPM', 'Genres',
  'IsCreatorFriendly', 'IsExplicit', 'IsFavorite', 'BrandTitle', 'LabelTitle', 'PreferredImageFileID',
  'TrackNumber', 'ReleaseID', 'ReleaseTitle', 'ReleaseVersion', 'ReleaseArtistsTitle', 'ReleaseDate',
  'ReleaseType', 'ReleaseCatalogID', 'ReleaseCoverFileID'
]

export const TRACK_FULL_COLUMNS = [
  ...TRACK_LIST_COLUMNS,
  'ReleaseGenres', 'ISRC', 'Tags', 'Lyrics', 'LyricsLanguage', 'PerformanceType', 'LabelID',
  'ReleaseDateTimezone', 'ReleaseUPC', 'ReleaseCopyrightPLine', 'BPM', 'Duration'
]
