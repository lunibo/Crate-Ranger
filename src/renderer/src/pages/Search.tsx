import { useEffect, useState } from 'react'
import { CoverPlayButton } from '../components/CoverPlayButton'
import { PreReleaseBadge } from '../components/PreReleaseBadge'
import { isPreRelease } from '@shared/release'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { NameEntity } from '@shared/types'
import { artistImage, catalog, fileCover, releaseCover, searchNames, searchPrompt, toTrack } from '../lib/api'
import { fmtYear } from '../lib/format'
import { useAuth } from '../lib/stores'
import { Cover, Empty, ErrorBox, LoadMore, Section, Spinner } from '../components/Common'
import { TrackTable } from '../components/TrackTable'
import { ArtistLinks } from '../components/ArtistLinks'

function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v)
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms)
    return () => clearTimeout(t)
  }, [v, ms])
  return d
}

function entityLink(e: NameEntity, kind: string): string {
  switch (kind) {
    case 'artist': return `/artist/${e.URI}`
    case 'release': return `/release/${e.ID}`
    case 'playlist': return `/playlist/${e.ID}`
    case 'genre': return `/browse?genres=${e.ID}&title=${encodeURIComponent(e.Name)}`
    case 'mood': return `/browse?moods=${encodeURIComponent(e.Name)}&title=${encodeURIComponent(e.Name)}`
    case 'theme': return `/browse?usages=${encodeURIComponent(e.Name)}&title=${encodeURIComponent(e.Name)}`
    default: return '/'
  }
}

function entityImage(e: NameEntity, kind: string): string | undefined {
  if (kind === 'artist') return artistImage(e.ID, 200)
  if (kind === 'release') return releaseCover(e.ID, 200, e.Image?.FileID)
  if (e.Image?.FileID) return fileCover(e.Image.FileID, 200)
  return undefined
}


function AiResults({ prompt }: { prompt: string }) {
  const { t } = useTranslation()
  const [extra, setExtra] = useState<ReturnType<typeof toTrack>[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const q = useQuery({ queryKey: ['ai', prompt], queryFn: () => searchPrompt(prompt, 50), staleTime: 10 * 60_000 })
  useEffect(() => setExtra([]), [prompt])
  if (q.isLoading) return <Spinner label={t('search.aiRunning')} />
  if (q.error) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
  const data = q.data!
  const tracks = [...(data.Data ?? []).map(toTrack), ...extra]
  const more = async (): Promise<void> => {
    setLoadingMore(true)
    try {
      const r = await catalog({ query_id: data.QueryID }, tracks.length, 50)
      setExtra((x) => [...x, ...(r.Data ?? []).map(toTrack)])
    } finally {
      setLoadingMore(false)
    }
  }
  return (
    <Section title={t('search.aiResults', { count: data.Total })}>
      {tracks.length ? <TrackTable tracks={tracks} /> : <Empty>{t('search.noMatchingTracks')}</Empty>}
      <LoadMore onClick={() => void more()} loading={loadingMore} hasMore={tracks.length < data.Total} />
    </Section>
  )
}

export function Search() {
  const { t } = useTranslation()
  // Eingabe passiert in der Titelleiste (layout/TitleBar.tsx), die den Begriff in die URL schreibt
  const [params] = useSearchParams()
  const nav = useNavigate()
  const mode = params.get('mode') === 'ai' ? 'ai' : 'names'
  const q = useDebounced((params.get('q') ?? '').trim(), 300)
  const loggedIn = useAuth((s) => !!s.state?.loggedIn)
  const names = useQuery({
    queryKey: ['names', q],
    queryFn: () => searchNames(q),
    enabled: mode === 'names' && q.length >= 2 && loggedIn,
    staleTime: 5 * 60_000
  })
  // Statistik: Suchbegriff zählen, wenn der Nutzer 1,5 s innehält (nicht jeden Tastendruck)
  useEffect(() => {
    if (mode !== 'names' || q.length < 2 || !loggedIn) return
    const timer = setTimeout(() => window.ss.stats.event({ type: 'search', ref: q }), 1500)
    return () => clearTimeout(timer)
  }, [q, mode, loggedIn])

  const groups = names.data?.NameMatches?.Groups ?? []
  const trackGroup = groups.find((g) => g.Kind === 'track')
  return (
    <div className="page">
      {!loggedIn && <div className="notice">{t('search.signInRequired')}</div>}
      {mode === 'ai' && params.get('q') ? (
        <AiResults prompt={params.get('q')!} />
      ) : q.length < 2 ? (
        <Empty>
          {t('search.intro')}
        </Empty>
      ) : names.isLoading ? (
        <Spinner />
      ) : names.error ? (
        <ErrorBox error={names.error} />
      ) : (
        <>
          {groups.filter((g) => g.Kind !== 'track' && g.Entities?.length).map((g) => (
            <Section key={g.Kind} title={t(`search.kinds.${g.Kind}`, { defaultValue: g.Kind })}>
              <div className="entity-row">
                {g.Entities!.map((e) => {
                  const meta = [e.ReleaseType, e.ReleaseDate ? fmtYear(e.ReleaseDate) : ''].filter(Boolean).join(' · ')
                  return (
                    <div key={e.ID} className="entity clickable" onClick={() => nav(entityLink(e, g.Kind))}>
                      <div className="entity-cover">
                        <Cover src={entityImage(e, g.Kind)} alt={e.Name} round={g.Kind === 'artist'} size={120} />
                        {g.Kind === 'release' && isPreRelease(e.ReleaseDate) && <PreReleaseBadge date={e.ReleaseDate ?? undefined} compact className="on-cover" />}
                        {g.Kind === 'release' && <CoverPlayButton releaseId={e.ID} title={e.Name} />}
                      </div>
                      <div className="card-title">
                        <Link to={entityLink(e, g.Kind)} onClick={(ev) => ev.stopPropagation()}>{e.Name}{e.Version ? ` (${e.Version})` : ''}</Link>
                      </div>
                      <div className="card-sub">
                        {e.ArtistsTitle && (g.Kind === 'release' ? <ArtistLinks text={e.ArtistsTitle} releaseId={e.ID} /> : e.ArtistsTitle)}
                        {e.ArtistsTitle && meta ? ' · ' : ''}
                        {meta}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Section>
          ))}
          {trackGroup?.Tracks?.length ? (
            <Section title={t('search.tracks', { count: trackGroup.Total })}>
              <TrackTable tracks={trackGroup.Tracks.map(toTrack)} />
            </Section>
          ) : null}
          {!groups.some((g) => (g.Entities?.length ?? 0) > 0 || (g.Tracks?.length ?? 0) > 0) && (
            <Empty>{t('search.noResults')}</Empty>
          )}
        </>
      )}
    </div>
  )
}
