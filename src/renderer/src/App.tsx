import { useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth, useDownloads, useFavorites, useLibrary, useQuota, useSettings } from './lib/stores'
import { initPlayer, usePlayer } from './player/player'
import { Toasts } from './components/Common'
import { AutoplayPrompt } from './components/AutoplayPrompt'
import { UpdatePrompt } from './components/UpdatePrompt'
import { LoginDialog } from './components/LoginDialog'
import { PlayerBar } from './layout/PlayerBar'
import { Sidebar } from './layout/Sidebar'
import { ArtistPage, ArtistsPage } from './pages/Artist'
import { Browse } from './pages/Browse'
import { DownloadsPage } from './pages/Downloads'
import { Explore } from './pages/Explore'
import { Home } from './pages/Home'
import { FavoritesPage, PlaylistPage, PlaylistsPage, SimilarPage } from './pages/Playlists'
import { ReleasePage, ReleasesPage } from './pages/Release'
import { Search } from './pages/Search'
import { SettingsPage } from './pages/Settings'
import { TrackPage } from './pages/Track'
import { FieldReportPage } from './pages/FieldReport'

export function App() {
  const mainRef = useRef<HTMLElement>(null)
  const loc = useLocation()

  useEffect(() => {
    void useAuth.getState().refresh()
    void useLibrary.getState().init()
    void useDownloads.getState().init()
    void useQuota.getState().init()
    void useSettings.getState().init().then(() => initPlayer(useSettings.getState().settings?.volume ?? 0.8))
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.code === 'Space') {
        e.preventDefault()
        usePlayer.getState().toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    // Favoriten laden, sobald angemeldet; bei Abmeldung leeren
    const unsubAuth = useAuth.subscribe((s, prev) => {
      const now = !!s.state?.loggedIn
      if (now === !!prev.state?.loggedIn) return
      if (now) void useFavorites.getState().load()
      else useFavorites.getState().clear()
    })
    return () => {
      window.removeEventListener('keydown', onKey)
      unsubAuth()
    }
  }, [])

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [loc.pathname])

  return (
    <div className="app">
      <Sidebar />
      <main className="main" ref={mainRef}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/releases" element={<ReleasesPage />} />
          <Route path="/release/:id" element={<ReleasePage />} />
          <Route path="/artists" element={<ArtistsPage />} />
          <Route path="/artist/:uri" element={<ArtistPage />} />
          <Route path="/playlists" element={<PlaylistsPage />} />
          <Route path="/playlist/:id" element={<PlaylistPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/track/:id" element={<TrackPage />} />
          <Route path="/similar/:trackId" element={<SimilarPage />} />
          <Route path="/downloads" element={<DownloadsPage tab="queue" />} />
          <Route path="/downloads/library" element={<DownloadsPage tab="library" />} />
          <Route path="/library" element={<Navigate to="/downloads/library" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/field-report" element={<FieldReportPage />} />
        </Routes>
      </main>
      <PlayerBar />
      {/* Hinweise unten rechts, untereinander statt übereinander */}
      <div className="prompt-stack">
        <Toasts />
        <UpdatePrompt />
        <AutoplayPrompt />
      </div>
      <LoginDialog />
    </div>
  )
}
