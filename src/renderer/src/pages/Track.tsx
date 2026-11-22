import { useMemo } from 'react'
import { PreReleaseBadge } from '../components/PreReleaseBadge'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { releaseCover, similarTo, tagDistribution, toTrack, trackRows } from '../lib/api'
import { capitalize, fmtDate, fmtDuration } from '../lib/format'
import { downloadTracks, localFile, trackStatus, useAuth, useLibrary } from '../lib/stores'
import { usePlayer } from '../player/player'
import { ArtistLinks } from '../components/ArtistLinks'
import { FavButton } from '../components/FavButton'
import { Cover, DownloadMenu, Empty, ErrorBox, Section, Spinner } from '../components/Common'
import { IconCheck, IconFolder, IconPlay, IconShield } from '../components/Icons'
import { TrackTable } from '../components/TrackTable'

const KEY_RE = /^([A-G](#|b)?)\s+(major|minor)$/i

export function TrackPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const rows = useQuery({ queryKey: ['track', id], queryFn: () => trackRows(id) })
  const dist = useQuery({ queryKey: ['tag-dist'], queryFn: tagDistribution, staleTime: 3600_000 })
  const loggedIn = useAuth((s) => !!s.state?.loggedIn)
  const similar = useQuery({ queryKey: ['similar', id], queryFn: () => similarTo(id, 20), enabled: loggedIn })
  const snap = useLibrary((s) => s.snap)

  const data = rows.data?.Data ?? []
  // Bevorzugt das Original-Release (frühestes Datum), Compilations erscheinen unter „Erscheint auf“
  const sorted = useMemo(() => [...data].sort((a, b) => (a.ReleaseDate ?? '').localeCompare(b.ReleaseDate ?? '')), [data])
  const row = sorted[0]
  const track = row ? toTrack(row) : null
  const categorized = useMemo(() => {
    const cats = new Map((dist.data ?? []).map((d) => [d.Tag.toLowerCase(), d.Category]))
    const groups: Record<string, string[]> = { moods: [], usages: [], instruments: [], other: [] }
    let key = ''
    for (const tag of row?.Tags ?? []) {
      if (KEY_RE.test(tag)) { key = tag; continue }
      const c = cats.get(tag.toLowerCase()) ?? 'other'
      ;(groups[c] ?? groups.other).push(tag)
    }
    return { groups, key }
  }, [row, dist.data])

  if (rows.isLoading) return <div className="page"><Spinner /></div>
  if (rows.error) return <div className="page"><ErrorBox error={rows.error} onRetry={() => void rows.refetch()} /></div>
  if (!row || !track) return <div className="page"><Empty>{t('track.notFound')}</Empty></div>

  const status = trackStatus(snap, track.trackId)
  const local = localFile(snap, track.trackId)
  const similarTracks = (similar.data?.Data ?? []).map(toTrack).filter((x) => x.trackId !== id)
  const genres = row.Genres?.length ? row.Genres : (row.ReleaseGenres ?? [])

  return (
    <div className="page">
      <header className="hero">
        <Link to={`/release/${row.ReleaseID}`} title={row.ReleaseTitle}>
          <Cover src={releaseCover(row.ReleaseID, 600, row.ReleaseCoverFileID)} alt={row.Title} size={220} />
        </Link>
        <div className="hero-info">
          <div className="hero-kind">
            {t('track.kind')}
            {track.preRelease && <PreReleaseBadge date={track.releaseDate} />}
          </div>
          <h1 className="hero-title">{row.Title}{row.Version ? <span className="version"> ({row.Version})</span> : null}</h1>
          <div className="hero-meta">
            <span className="strong"><ArtistLinks artists={track.artists} text={track.artistsTitle} trackId={track.trackId} /></span>
            <span>·</span>
            <Link to={`/release/${row.ReleaseID}`} className="strong">{row.ReleaseTitle}{row.ReleaseVersion ? ` (${row.ReleaseVersion})` : ''}</Link>
            {row.ReleaseDate && <span>· {fmtDate(row.ReleaseDate)}</span>}
            <span>· {fmtDuration(track.duration)}</span>
          </div>
          <div className="hero-tags">
            {genres.map((g) => <Link key={g.ID} className="tag" to={`/browse?genres=${g.ID}&title=${encodeURIComponent(g.Title)}`}>{g.Title}</Link>)}
            {track.bpm > 0 && <Link className="tag" to={`/browse?bpm_min=${track.bpm}&bpm_max=${track.bpm}&title=${track.bpm}%20BPM`}>{track.bpm} BPM</Link>}
            {categorized.key && <span className="tag">{categorized.key}</span>}
            {row.BrandTitle && <span className="tag">{row.BrandTitle}</span>}
            <span className={`tag cs ${track.creatorSafe ? 'ok' : 'no'}`}><IconShield ok={track.creatorSafe} size={12} /> {track.creatorSafe ? t('track.copyrightSafe') : t('track.licenseRequired')}</span>
            {track.explicit && <span className="tag">{t('track.explicit')}</span>}
          </div>
        </div>
      </header>

      <div className="actions">
        <button className="play-btn big" onClick={() => usePlayer.getState().playList([track])} title={t('player.play')}><IconPlay /></button>
        <FavButton track={track} size={26} big />
        <DownloadMenu unavailableUntil={track.preRelease ? track.releaseDate : undefined} onDownload={(f, force) => void downloadTracks([track], f, force)} />
        {status === 'downloaded' && <span className="progress-pill full"><IconCheck size={14} /> {t('status.downloaded')}</span>}
        {local && <button className="btn btn-ghost" onClick={() => void window.ss.shell.showItem(local)}><IconFolder size={16} /> {t('common.showInExplorer')}</button>}
      </div>

      <div className="track-details">
        <div className="card-box">
          {(['moods', 'usages', 'instruments'] as const).map((c) => categorized.groups[c].length > 0 && (
            <div key={c} className="kv wrap">
              <span>{t(`track.categories.${c}`)}</span>
              <span className="chips">
                {categorized.groups[c].map((tag) => (
                  <Link key={tag} className="tag" to={`/browse?${c}=${encodeURIComponent(tag)}&title=${encodeURIComponent(tag)}`}>{capitalize(tag)}</Link>
                ))}
              </span>
            </div>
          ))}
          {categorized.groups.other.length > 0 && (
            <div className="kv wrap"><span>{t('track.categories.tags')}</span><span className="chips">{categorized.groups.other.map((tag) => <span key={tag} className="tag">{tag}</span>)}</span></div>
          )}
          {row.PerformanceType && <div className="kv"><span>{t('track.fields.performance')}</span><span>{t(`track.performance.${row.PerformanceType}`, { defaultValue: row.PerformanceType })}</span></div>}
          {row.ISRC && <div className="kv"><span>{t('track.fields.isrc')}</span><span className="mono-sel">{row.ISRC}</span></div>}
          {row.ReleaseCatalogID && <div className="kv"><span>{t('track.fields.catalogNumber')}</span><span className="mono-sel">{row.ReleaseCatalogID}</span></div>}
          {row.LabelTitle && <div className="kv"><span>{t('track.fields.label')}</span><span>{row.LabelTitle}</span></div>}
          {row.ReleaseCopyrightPLine && <div className="kv"><span>{t('track.fields.copyright')}</span><span>℗ {new Date(row.ReleaseDate ?? '').getFullYear()} {row.ReleaseCopyrightPLine}</span></div>}
        </div>
        {row.Lyrics && (
          <div className="card-box lyrics">
            <div className="strong">{t('track.lyrics')}</div>
            <p>{row.Lyrics}</p>
          </div>
        )}
      </div>

      {sorted.length > 1 && (
        <Section title={t('track.appearsOn')}>
          <div className="appears">
            {sorted.map((r) => (
              <Link key={r.ReleaseID} to={`/release/${r.ReleaseID}`} className="appears-item">
                <Cover src={releaseCover(r.ReleaseID, 120, r.ReleaseCoverFileID)} alt={r.ReleaseTitle ?? ''} size={48} />
                <div>
                  <div className="strong">{r.ReleaseTitle}</div>
                  <div className="muted small">{[r.ReleaseType ? t(`releaseType.${r.ReleaseType}`, { defaultValue: r.ReleaseType }) : '', r.ReleaseDate ? fmtDate(r.ReleaseDate) : '', r.ReleaseCatalogID].filter(Boolean).join(' · ')}</div>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {loggedIn && (
        <Section title={t('trackMenu.similar')} action={<Link to={`/similar/${id}`} className="link-more">{t('common.showAll')}</Link>}>
          {similar.isLoading ? <Spinner /> : similar.error ? <ErrorBox error={similar.error} /> : <TrackTable tracks={similarTracks.slice(0, 10)} />}
        </Section>
      )}
    </div>
  )
}
