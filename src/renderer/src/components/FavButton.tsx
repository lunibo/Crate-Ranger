import type { TrackLite } from '../lib/api'
import { useTranslation } from 'react-i18next'
import { useAuth, useFavorites } from '../lib/stores'
import { IconHeart } from './Icons'

/** Herz-Button: fügt den Track zu den SoundScout-Favoriten hinzu bzw. entfernt ihn. */
export function FavButton({ track, size = 18, big }: { track: Pick<TrackLite, 'trackId' | 'title'>; size?: number; big?: boolean }) {
  const { t } = useTranslation()
  const loggedIn = useAuth((s) => !!s.state?.loggedIn)
  const fav = useFavorites((s) => s.ids.has(track.trackId))
  if (!loggedIn) return null
  const label = fav ? t('favorites.remove') : t('favorites.add')
  return (
    <button
      className={`icon-btn fav ${fav ? 'on' : ''} ${big ? 'fav-big' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        void useFavorites.getState().toggle(track)
      }}
      aria-label={label}
      aria-pressed={fav}
      title={label}
    >
      <IconHeart filled={fav} size={size} />
    </button>
  )
}
