import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { locale } from '../lib/i18n'
import { Link } from 'react-router-dom'
import type { LibraryTrack } from '@shared/types'
import { FORMAT_LABEL } from '@shared/types'
import { releaseCover, type TrackLite } from '../lib/api'
import { fmtBytes } from '../lib/format'
import { downloadRelease, toast, useLibrary, useSettings } from '../lib/stores'
import { usePlayer } from '../player/player'
import { Cover, Empty } from '../components/Common'
import { ArtistLinks, TrackLink } from '../components/ArtistLinks'
import { IconAlert, IconFolder, IconPlay, IconRefresh } from '../components/Icons'

function libToTrack(t: LibraryTrack): TrackLite {
  return {
    trackId: t.trackId, releaseId: t.releaseId, title: t.title, version: '', artistsTitle: t.artist, artists: [],
    releaseTitle: t.releaseTitle, releaseArtist: t.releaseArtist, releaseDate: '', releaseType: '', coverFileId: '',
    duration: 0, bpm: 0, genres: [], tags: [], creatorSafe: false, explicit: false, favorite: false, brand: '', trackNumber: t.trackNumber, preRelease: false
  }
}

export function LibraryPage() {
  const { t } = useTranslation()
  const snap = useLibrary((s) => s.snap)
  const root = useSettings((s) => s.settings?.downloadRoot)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)

  const unknown = t('library.unknownArtist')
  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase()
    const byArtist = new Map<string, Map<string, LibraryTrack[]>>()
    for (const tr of Object.values(snap.tracks)) {
      if (f && ![tr.title, tr.artist, tr.releaseTitle, tr.releaseArtist].some((x) => x?.toLowerCase().includes(f))) continue
      const artist = tr.releaseArtist || tr.artist || unknown
      if (!byArtist.has(artist)) byArtist.set(artist, new Map())
      const rels = byArtist.get(artist)!
      if (!rels.has(tr.releaseId)) rels.set(tr.releaseId, [])
      rels.get(tr.releaseId)!.push(tr)
    }
    return [...byArtist.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], locale()))
      .map(([artist, rels]) => ({
        artist,
        releases: [...rels.entries()].map(([releaseId, tracks]) => ({
          releaseId,
          info: snap.releases[releaseId],
          tracks: tracks.sort((a, b) => a.trackNumber - b.trackNumber)
        })).sort((a, b) => (b.info?.year ?? '').localeCompare(a.info?.year ?? ''))
      }))
  }, [snap, filter, unknown])

  const all = Object.values(snap.tracks)
  const missing = all.filter((tr) => tr.files.every((f) => f.missing)).length
  const size = all.reduce((n, tr) => n + tr.files.filter((f) => !f.missing).reduce((m, f) => m + f.size, 0), 0)

  const run = async (fn: () => Promise<{ scanned: number; added: number; missing: number }>): Promise<void> => {
    setBusy(true)
    try {
      const r = await fn()
      toast('success', t('library.scanResult', { scanned: r.scanned, added: r.added, missing: r.missing }))
    } catch (e) {
      toast('error', String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head-row">
        <h1 className="page-title">{t('nav.library')}</h1>
        <span className="muted">{t('common.trackCount', { count: all.length, formatted: all.length })} · {t('common.releaseCount', { count: Object.keys(snap.releases).length })} · {fmtBytes(size)}</span>
      </div>
      <div className="actions">
        <input className="input" placeholder={t('library.filter')} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className="btn btn-secondary" disabled={busy} onClick={() => void run(() => window.ss.library.verify())}>
          <IconRefresh size={16} /> {t('library.verify')}
        </button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => void run(() => window.ss.library.scan())} title={t('library.scanHint')}>
          <IconFolder size={16} /> {t('library.scan')}
        </button>
        {root && <button className="btn btn-ghost" onClick={() => void window.ss.shell.openPath(root)}>{t('library.openFolder')}</button>}
      </div>
      {missing > 0 && <div className="notice warn"><IconAlert size={16} /> {t('library.missingNotice', { count: missing })}</div>}
      {!all.length ? (
        <Empty>{t('library.empty')}</Empty>
      ) : (
        groups.map((g) => (
          <section key={g.artist} className="lib-artist">
            <h2><ArtistLinks text={g.artist} releaseId={g.releases[0]?.releaseId} /></h2>
            {g.releases.map((r) => {
              const total = r.info?.trackTotal ?? 0
              const have = r.tracks.filter((tr) => tr.files.some((f) => !f.missing)).length
              return (
                <div key={r.releaseId} className="lib-release">
                  <Link to={`/release/${r.releaseId}`}><Cover src={releaseCover(r.releaseId, 160)} alt={r.info?.title ?? ''} size={72} /></Link>
                  <div className="lib-release-body">
                    <div className="lib-release-head">
                      <Link to={`/release/${r.releaseId}`} className="strong">{r.info?.title ?? r.tracks[0]?.releaseTitle}</Link>
                      <span className="muted">{[r.info?.year, r.info?.type, r.info?.catalogId].filter(Boolean).join(' · ')}</span>
                      <span className={`progress-pill ${total && have >= total ? 'full' : ''}`}>{have}/{total || '?'}</span>
                      {total > have && (
                        <button className="btn btn-ghost btn-sm" onClick={() => void downloadRelease(r.releaseId)}>{t('library.downloadMissing')}</button>
                      )}
                      <button className="icon-btn" title={t('player.play')} onClick={() => usePlayer.getState().playList(r.tracks.map(libToTrack))}><IconPlay size={14} /></button>
                    </div>
                    <div className="lib-tracks">
                      {r.tracks.map((tr) => {
                        const file = tr.files.find((f) => !f.missing) ?? tr.files[0]
                        return (
                          <div key={tr.trackId} className={`lib-track ${file?.missing ? 'missing' : ''}`}>
                            <span className="n">{String(tr.trackNumber).padStart(2, '0')}</span>
                            <span className="t"><TrackLink trackId={tr.trackId} title={tr.title} /></span>
                            <span className="muted">{tr.artist !== tr.releaseArtist ? <ArtistLinks text={tr.artist} trackId={tr.trackId} /> : ''}</span>
                            <span className="fmt">{tr.files.map((f) => FORMAT_LABEL[f.format]).join(', ')}</span>
                            <span className="muted">{file ? fmtBytes(file.size) : ''}</span>
                            {file?.missing ? (
                              <span className="status warn" title={t('status.missing')}><IconAlert size={14} /></span>
                            ) : (
                              <button className="icon-btn" title={t('common.showInExplorer')} onClick={() => void window.ss.shell.showItem(file.path)}><IconFolder size={14} /></button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </section>
        ))
      )}
    </div>
  )
}
