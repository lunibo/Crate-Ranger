import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { artistsForTracks, errorMessage, releaseArtists, type TrackLite } from '../lib/api'
import { toast } from '../lib/stores'
import { t } from '../lib/i18n'

type ArtistRef = TrackLite['artists'][number]

const artistPath = (a: { uri?: string; id: string }): string => `/artist/${a.uri || a.id}`

/**
 * Klickbare Artist-Namen. Sind die Artists (IDs) bekannt, werden direkte Links gerendert.
 * Sonst wird der Text klickbar und die Artists werden beim Klick über den Track bzw. das Release aufgelöst.
 */
export function ArtistLinks({
  artists,
  text,
  trackId,
  releaseId
}: {
  artists?: ArtistRef[]
  text: string
  trackId?: string
  releaseId?: string
}) {
  if (artists?.length) {
    return (
      <span className="artists">
        {artists.map((a, i) => (
          <Fragment key={a.id}>
            {i > 0 && ', '}
            <Link to={artistPath(a)} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
              {a.name}
            </Link>
          </Fragment>
        ))}
      </span>
    )
  }
  if (!text) return null
  if (!trackId && !releaseId) return <span>{text}</span>
  return <ResolvingArtist text={text} trackId={trackId} releaseId={releaseId} />
}

function ResolvingArtist({ text, trackId, releaseId }: { text: string; trackId?: string; releaseId?: string }) {
  const nav = useNavigate()
  const [choices, setChoices] = useState<ArtistRef[] | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!choices) return
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setChoices(null)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [choices])

  const resolve = async (e: React.MouseEvent): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPos({ x: Math.min(rect.left, window.innerWidth - 220), y: rect.bottom + 4 })
    setBusy(true)
    try {
      let list: ArtistRef[] = []
      if (trackId) list = (await artistsForTracks([trackId]))[trackId] ?? []
      if (!list.length && releaseId) {
        list = (await releaseArtists(releaseId))
          .sort((a, b) => (a.Role === b.Role ? a.ArtistNumber - b.ArtistNumber : a.Role === 'Primary' ? -1 : 1))
          .map((a) => ({ id: a.ArtistID, name: a.DisplayName, uri: '' }))
      }
      if (list.length === 1) nav(artistPath(list[0]))
      else if (list.length > 1) setChoices(list)
      else toast('info', t('artist.noPage'))
    } catch (err) {
      toast('error', errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="artist-resolve" ref={ref}>
      <a href="#" role="link" onClick={(e) => void resolve(e)} onDoubleClick={(e) => e.stopPropagation()} title={t('artist.open')}>
        {text}
      </a>
      {choices && (
        <span className="menu artist-menu" style={{ left: pos.x, top: pos.y }} onClick={(e) => e.stopPropagation()}>
          {choices.map((a) => (
            <button key={a.id} className="menu-item" onClick={(e) => { e.preventDefault(); setChoices(null); nav(artistPath(a)) }}>
              {a.name}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

/** Songtitel als Link zur Track-Seite. */
export function TrackLink({ trackId, title, version, className }: { trackId: string; title: string; version?: string; className?: string }) {
  return (
    <Link to={`/track/${trackId}`} className={className} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      {title}
      {version && <span className="version"> ({version})</span>}
    </Link>
  )
}
