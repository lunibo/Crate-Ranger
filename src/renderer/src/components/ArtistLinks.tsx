import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const menuRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!choices) return
    const closeMenu = (): void => setChoices(null)
    const close = (e: MouseEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) closeMenu()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeMenu()
    }
    const onScroll = (e: Event): void => {
      if (!menuRef.current?.contains(e.target as Node)) closeMenu()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', closeMenu)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', closeMenu)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [choices])
  // Im Fenster halten: unter dem Namen, sonst darüber (z.B. im Player am unteren Rand); seitlich nicht abschneiden
  useLayoutEffect(() => {
    if (!choices || !anchor || !menuRef.current) return setPos(null)
    const { width, height } = menuRef.current.getBoundingClientRect()
    const m = 8
    const below = anchor.bottom + 4
    setPos({
      x: Math.max(m, Math.min(anchor.left, window.innerWidth - width - m)),
      y: below + height + m <= window.innerHeight ? below : Math.max(m, anchor.top - 4 - height)
    })
  }, [choices, anchor])

  const resolve = async (e: React.MouseEvent): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
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
      else if (list.length > 1) {
        setAnchor(rect)
        setChoices(list)
      }
      else toast('info', t('artist.noPage'))
    } catch (err) {
      toast('error', errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="artist-resolve">
      <a href="#" role="link" onClick={(e) => void resolve(e)} onDoubleClick={(e) => e.stopPropagation()} title={t('artist.open')}>
        {text}
      </a>
      {choices && createPortal(
        <span
          className="menu artist-menu"
          ref={menuRef}
          // Erst nach dem Ausmessen sichtbar, damit es nicht kurz an der falschen Stelle aufblitzt
          style={pos ? { left: pos.x, top: pos.y } : { left: 0, top: 0, visibility: 'hidden' }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {choices.map((a) => (
            <button key={a.id} className="menu-item" onClick={(e) => { e.preventDefault(); setChoices(null); nav(artistPath(a)) }}>
              {a.name}
            </button>
          ))}
        </span>,
        document.body
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
