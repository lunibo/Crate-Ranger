import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { catalog, publicPlaylists, releases, toTrack } from '../lib/api'
import { useAuth } from '../lib/stores'
import { Grid, PlaylistCard, ReleaseCard } from '../components/Cards'
import { ErrorBox, Section, Spinner } from '../components/Common'
import { TrackTable } from '../components/TrackTable'

function greetingKey(): 'home.morning' | 'home.day' | 'home.evening' {
  const h = new Date().getHours()
  return h < 11 ? 'home.morning' : h < 18 ? 'home.day' : 'home.evening'
}

export function Home() {
  const { t } = useTranslation()
  const auth = useAuth((s) => s.state)
  const newReleases = useQuery({ queryKey: ['home-releases'], queryFn: () => releases({ sort: '-ReleaseDate', limit: 12 }) })
  const popular = useQuery({ queryKey: ['home-popular'], queryFn: () => catalog({ sort: '-Popularity' }, 0, 15) })
  const playlists = useQuery({ queryKey: ['home-playlists'], queryFn: () => publicPlaylists(12) })
  return (
    <div className="page">
      <h1 className="page-title">{t(greetingKey())}</h1>
      {auth && !auth.loggedIn && (
        <div className="notice">
          {t('home.notSignedIn')}
          <button className="btn btn-primary btn-sm" onClick={() => useAuth.getState().openDialog(true)}>{t('auth.signInNow')}</button>
        </div>
      )}
      <Section title={t('home.newReleases')} action={<Link to="/releases" className="link-more">{t('common.showAll')}</Link>}>
        {newReleases.isLoading ? <Spinner /> : newReleases.error ? <ErrorBox error={newReleases.error} onRetry={() => void newReleases.refetch()} /> : (
          <Grid>{(newReleases.data?.Data ?? []).map((r) => <ReleaseCard key={r.ID} r={r} />)}</Grid>
        )}
      </Section>
      <Section title={t('home.popularTracks')} action={<Link to="/browse?sort=-Popularity" className="link-more">{t('common.more')}</Link>}>
        {popular.isLoading ? <Spinner /> : popular.error ? <ErrorBox error={popular.error} /> : (
          <TrackTable tracks={(popular.data?.Data ?? []).map(toTrack)} />
        )}
      </Section>
      <Section title={t('nav.playlists')} action={<Link to="/playlists" className="link-more">{t('common.showAll')}</Link>}>
        {playlists.isLoading ? <Spinner /> : playlists.error ? <ErrorBox error={playlists.error} /> : (
          <Grid>{(playlists.data?.Data ?? []).map((p) => <PlaylistCard key={p.ID} p={p} />)}</Grid>
        )}
      </Section>
    </div>
  )
}
