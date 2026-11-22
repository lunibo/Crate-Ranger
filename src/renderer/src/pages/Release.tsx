import { useMemo } from 'react'
import { PreReleaseBadge } from '../components/PreReleaseBadge'
import { isPreRelease } from '@shared/release'
import { useTranslation } from 'react-i18next'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { release, releaseArtists, releaseCover, releaseTracks, releases, toTrack } from '../lib/api'
import { fmtDate, fmtDuration } from '../lib/format'
import { downloadRelease, releaseProgress, useLibrary } from '../lib/stores'
import { usePlayer } from '../player/player'
import { Grid, ReleaseCard } from '../components/Cards'
import { Cover, DownloadMenu, ErrorBox, LoadMore, Section, Spinner } from '../components/Common'
import { IconCheck, IconPlay } from '../components/Icons'
import { TrackTable } from '../components/TrackTable'

export function ReleasePage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const rel = useQuery({ queryKey: ['release', id], queryFn: () => release(id) })
  const tracksQ = useQuery({ queryKey: ['release-tracks', id], queryFn: () => releaseTracks(id) })
  const artistsQ = useQuery({ queryKey: ['release-artists', id], queryFn: () => releaseArtists(id) })
  const primary = (artistsQ.data ?? []).filter((a) => a.Role === 'Primary').sort((a, b) => a.ArtistNumber - b.ArtistNumber)
  const more = useQuery({
    queryKey: ['artist-releases-by-id', primary[0]?.ArtistID],
    queryFn: () => releases({ artist_id: primary[0].ArtistID, sort: '-Popularity', limit: 13 }),
    enabled: !!primary[0]
  })
  const snap = useLibrary((s) => s.snap)
  const tracks = useMemo(() => (tracksQ.data?.Data ?? []).map(toTrack), [tracksQ.data])
  if (rel.isLoading) return <div className="page"><Spinner /></div>
  if (rel.error || !rel.data) return <div className="page"><ErrorBox error={rel.error} onRetry={() => void rel.refetch()} /></div>
  const r = rel.data
  const prog = releaseProgress(snap, r.ID, tracksQ.data?.Total)
  const totalDur = tracks.reduce((n, t) => n + t.duration, 0)
  return (
    <div className="page">
      <header className="hero">
        <Cover src={releaseCover(r.ID, 600, r.CoverFileID)} alt={r.Title} size={220} />
        <div className="hero-info">
          <div className="hero-kind">
            {t(`releaseType.${r.Type}`, { defaultValue: r.Type })}
            {isPreRelease(r.ReleaseDate) && <PreReleaseBadge date={r.ReleaseDate} />}
          </div>
          <h1 className="hero-title">{r.Title}{r.Version ? ` (${r.Version})` : ''}</h1>
          <div className="hero-meta">
            {primary.length ? (
              <span>
                {primary.map((a, i) => (
                  <span key={a.ArtistID}>{i > 0 && ', '}<Link to={`/artist/${a.ArtistID}`} className="strong">{a.DisplayName}</Link></span>
                ))}
              </span>
            ) : <span className="strong">{r.ArtistsTitle}</span>}
            <span>· {fmtDate(r.ReleaseDate)}</span>
            {tracks.length > 0 && <span>· {t('common.trackCount', { count: tracks.length, formatted: tracks.length })}, {fmtDuration(totalDur)}</span>}
          </div>
          <div className="hero-tags">
            {r.CatalogID && <span className="tag">{r.CatalogID}</span>}
            {r.Genres?.map((g) => <Link key={g.ID} className="tag" to={`/browse?genres=${g.ID}&title=${encodeURIComponent(g.Title)}`}>{g.Title}</Link>)}
            {r.UPC && <span className="tag muted">UPC {r.UPC}</span>}
          </div>
        </div>
      </header>
      <div className="actions">
        <button className="play-btn big" disabled={!tracks.length} onClick={() => usePlayer.getState().playList(tracks)} title={t('player.play')}><IconPlay /></button>
        <DownloadMenu label={t('download.release')} unavailableUntil={isPreRelease(r.ReleaseDate) ? r.ReleaseDate : undefined} onDownload={(f, force) => void downloadRelease(r.ID, f, force)} />
        {prog.done > 0 && (
          <span className={`progress-pill ${prog.total && prog.done >= prog.total ? 'full' : ''}`}>
            <IconCheck size={14} /> {t('status.progressDownloaded', { done: prog.done, total: prog.total || tracks.length })}
          </span>
        )}
      </div>
      {tracksQ.isLoading ? <Spinner /> : tracksQ.error ? <ErrorBox error={tracksQ.error} /> : (
        <TrackTable tracks={tracks} showCover={false} showRelease={false} numbering="track" />
      )}
      {r.Description && <p className="description">{r.Description}</p>}
      {r.CopyrightPLine && <p className="muted small">℗ {new Date(r.ReleaseDate).getFullYear()} {r.CopyrightPLine}</p>}
      {(more.data?.Data ?? []).filter((x) => x.ID !== r.ID).length > 0 && (
        <Section
          title={t('release.moreFrom', { artist: primary[0]?.DisplayName ?? r.ArtistsTitle })}
          action={primary[0] ? <Link to={`/artist/${primary[0].ArtistID}`} className="link-more">{t('release.goToArtist')}</Link> : undefined}
        >
          <Grid>{more.data!.Data!.filter((x) => x.ID !== r.ID).slice(0, 12).map((x) => <ReleaseCard key={x.ID} r={x} />)}</Grid>
        </Section>
      )}
    </div>
  )
}

export function ReleasesPage() {
  const { t } = useTranslation()
  const q = useInfiniteQuery({
    queryKey: ['releases-all'],
    queryFn: ({ pageParam }) => releases({ sort: '-ReleaseDate', offset: pageParam, limit: 36 }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const n = pages.reduce((s, p) => s + (p.Data?.length ?? 0), 0)
      return n < last.Total ? n : undefined
    }
  })
  const items = (q.data?.pages ?? []).flatMap((p) => p.Data ?? [])
  return (
    <div className="page">
      <h1 className="page-title">{t('home.newReleases')}</h1>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} /> : (
        <>
          <Grid>{items.map((r) => <ReleaseCard key={r.ID} r={r} />)}</Grid>
          <LoadMore onClick={() => void q.fetchNextPage()} loading={q.isFetchingNextPage} hasMore={!!q.hasNextPage} />
        </>
      )}
    </div>
  )
}
