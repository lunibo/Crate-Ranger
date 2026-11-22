import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessage, releaseTracks, toTrack } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { toast } from '../lib/stores'
import { usePlayer } from '../player/player'
import { IconPause, IconPlay } from './Icons'

/** Lädt die Tracks eines Releases (gleicher Cache wie die Release-Seite). */
export function fetchReleaseTracks(releaseId: string) {
  return queryClient.fetchQuery({ queryKey: ['release-tracks', releaseId], queryFn: () => releaseTracks(releaseId), staleTime: 5 * 60_000 })
}

/**
 * Runder Play-Button auf einem Release-Cover (erscheint beim Überfahren).
 * Startet das Release ab Track 1; läuft es bereits, schaltet er Pause/Weiter.
 */
export function CoverPlayButton({ releaseId, title }: { releaseId: string; title: string }) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const isCurrent = usePlayer((s) => s.current?.releaseId === releaseId)
  const playing = usePlayer((s) => s.playing)
  const active = isCurrent && playing

  const onClick = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    e.preventDefault()
    if (isCurrent) return usePlayer.getState().toggle()
    setLoading(true)
    try {
      const res = await fetchReleaseTracks(releaseId)
      const tracks = (res.Data ?? []).map(toTrack)
      if (!tracks.length) toast('info', t('release.noTracks'))
      else usePlayer.getState().playList(tracks)
    } catch (err) {
      toast('error', errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const label = active ? t('player.pause') : t('release.play', { title })
  return (
    <button
      type="button"
      className={`cover-play ${isCurrent ? 'current' : ''}`}
      onClick={(e) => void onClick(e)}
      onDoubleClick={(e) => e.stopPropagation()}
      aria-label={label}
      title={label}
    >
      {loading ? <span className="spinner small" /> : active ? <IconPause size={22} /> : <IconPlay size={22} />}
    </button>
  )
}
