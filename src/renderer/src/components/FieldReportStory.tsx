import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { FieldReport } from '@shared/fieldReport'
import { artistImage, releaseCover } from '../lib/api'
import { fmtNumber } from '../lib/format'
import { timelineData, useReportFormat } from '../lib/reportFormat'
import { ColumnChart, RankedBars } from './Charts'
import { Cover } from './Common'
import { IconPause, IconPlay, IconX } from './Icons'

const SLIDE_MS = 7000

interface Slide {
  key: string
  theme: string
  body: ReactNode
}

/** Story-Modus des Field Reports: Vollbild-Folien mit Fortschrittsbalken. */
export function FieldReportStory({ w, title, onClose }: { w: FieldReport; title: string; onClose: () => void }) {
  const { t } = useTranslation()
  const f = useReportFormat()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const slides = useMemo<Slide[]>(() => {
    const s: Slide[] = []
    const topArtist = w.topArtists[0]
    const topTrack = w.topTracks[0]
    s.push({
      key: 'intro',
      theme: 'intro',
      body: (
        <>
          <div className="story-kicker">Crate Ranger Field Report</div>
          <div className="story-huge">{title}</div>
          <p className="story-text">{t('report.story.intro')}</p>
        </>
      )
    })
    s.push({
      key: 'minutes',
      theme: 'minutes',
      body: (
        <>
          <p className="story-text">{t('report.story.minutesBefore')}</p>
          <div className="story-number">{f.nf(Math.round(w.totals.minutes))}</div>
          <p className="story-text">{t('report.story.minutesAfter', { days: f.nf(w.totals.minutes / 1440, 1), tracks: fmtNumber(w.totals.tracks) })}</p>
        </>
      )
    })
    if (topArtist) {
      s.push({
        key: 'artist',
        theme: 'artist',
        body: (
          <>
            <p className="story-text">{t('report.story.topArtist')}</p>
            <Cover src={topArtist.id ? artistImage(topArtist.id, 600) : undefined} alt={topArtist.name} round size={220} />
            <div className="story-big">{topArtist.name}</div>
            <p className="story-text">{t('report.story.topArtistMinutes', { minutes: f.minutes(topArtist.minutes) })}</p>
          </>
        )
      })
      s.push({
        key: 'artists',
        theme: 'list',
        body: (
          <>
            <div className="story-kicker">{t('report.topArtists')}</div>
            <ol className="story-list">
              {w.topArtists.slice(0, 5).map((a, i) => (
                <li key={a.id || a.name}>
                  <span className="story-rank">{i + 1}</span>
                  <Cover src={a.id ? artistImage(a.id, 160) : undefined} alt={a.name} round size={56} />
                  <span className="story-li-name">{a.name}</span>
                </li>
              ))}
            </ol>
          </>
        )
      })
    }
    if (topTrack) {
      s.push({
        key: 'track',
        theme: 'track',
        body: (
          <>
            <p className="story-text">{t('report.story.topTrack')}</p>
            <Cover src={releaseCover(topTrack.releaseId, 600)} alt={topTrack.title} size={240} />
            <div className="story-big">{topTrack.title}{topTrack.version ? ` (${topTrack.version})` : ''}</div>
            <p className="story-text">{topTrack.artists} · {t('report.story.timesPlayed', { count: topTrack.plays })}</p>
          </>
        )
      })
    }
    if (w.genres.length) {
      s.push({
        key: 'genres',
        theme: 'genres',
        body: (
          <>
            <div className="story-kicker">{t('report.genres')}</div>
            <div className="story-big">{w.genres[0].name}</div>
            <div className="story-chart">
              <RankedBars rows={w.genres.slice(0, 5).map((g) => ({ key: g.name, name: g.name, value: g.share * 100 }))} format={(v) => f.percent(v / 100)} />
            </div>
          </>
        )
      })
    }
    if (w.peakHour !== null) {
      const hours = w.byHour.map((b) => ({ label: b.value % 6 === 0 ? f.hour(b.value) : '', name: f.hour(b.value), value: b.minutes }))
      s.push({
        key: 'clock',
        theme: 'clock',
        body: (
          <>
            <p className="story-text">{t('report.story.clock')}</p>
            <div className="story-big">{f.hour(w.peakHour)}</div>
            {w.peakWeekday !== null && <p className="story-text">{t('report.story.weekday', { day: f.weekday(w.peakWeekday, 'long') })}</p>}
            <div className="story-chart"><ColumnChart data={hours} format={f.axisMinutes} labelEvery={1} height={160} ariaLabel={t('report.clock')} /></div>
          </>
        )
      })
    }
    if (w.timeline.buckets.length > 1) {
      s.push({
        key: 'timeline',
        theme: 'timeline',
        body: (
          <>
            <div className="story-kicker">{w.timeline.unit === 'day' ? t('report.byDay') : t('report.byMonth')}</div>
            {w.longestStreak.days > 1 && <div className="story-big">{t('report.story.streak', { count: w.longestStreak.days })}</div>}
            <div className="story-chart"><ColumnChart data={timelineData(w, f)} format={f.axisMinutes} height={180} ariaLabel={t('report.byMonth')} /></div>
          </>
        )
      })
    }
    if (w.discoveries.count > 0) {
      s.push({
        key: 'discover',
        theme: 'discover',
        body: (
          <>
            <p className="story-text">{t('report.story.discover')}</p>
            <div className="story-number">{fmtNumber(w.discoveries.count)}</div>
            <p className="story-text">{t('report.story.discoverAfter', { names: w.discoveries.top.slice(0, 3).map((a) => a.name).join(', ') })}</p>
          </>
        )
      })
    }
    s.push({
      key: 'persona',
      theme: `persona persona-${w.persona}`,
      body: (
        <>
          <div className="story-kicker">{t('report.personaKicker')}</div>
          <div className="story-huge">{t(`report.persona.${w.persona}.title`)}</div>
          <p className="story-text">
            {t(`report.persona.${w.persona}.text`, { hour: w.peakHour !== null ? f.hour(w.peakHour) : '', artist: topArtist?.name ?? '', bpm: Math.round(w.tempo.avgBpm), genre: w.genres[0]?.name ?? '' })}
          </p>
        </>
      )
    })
    s.push({
      key: 'summary',
      theme: 'summary',
      body: (
        <div className="story-summary">
          <div className="story-kicker">{title}</div>
          <div className="summary-grid">
            <div>
              <div className="summary-label">{t('report.topArtists')}</div>
              <ol>{w.topArtists.slice(0, 5).map((a) => <li key={a.id || a.name}>{a.name}</li>)}</ol>
            </div>
            <div>
              <div className="summary-label">{t('report.topTracks')}</div>
              <ol>{w.topTracks.slice(0, 5).map((tr) => <li key={tr.trackId}>{tr.title}</li>)}</ol>
            </div>
            <div>
              <div className="summary-label">{t('report.minutesListened')}</div>
              <div className="summary-value">{f.nf(Math.round(w.totals.minutes))}</div>
            </div>
            <div>
              <div className="summary-label">{t('report.topGenre')}</div>
              <div className="summary-value">{w.genres[0]?.name ?? '—'}</div>
            </div>
          </div>
          <div className="summary-brand">◆ Crate Ranger · {t(`report.persona.${w.persona}.title`)}</div>
        </div>
      )
    })
    return s
  }, [w, title, t, f])

  const go = useCallback(
    (d: number) => {
      setElapsed(0)
      setIndex((i) => {
        const n = i + d
        if (n >= slides.length) {
          onClose()
          return i
        }
        return Math.max(0, n)
      })
    },
    [slides.length, onClose]
  )

  // Automatisch weiter
  useEffect(() => {
    if (paused) return
    const step = 100
    const timer = setInterval(() => {
      setElapsed((e) => {
        if (e + step >= SLIDE_MS) {
          go(1)
          return 0
        }
        return e + step
      })
    }, step)
    return () => clearInterval(timer)
  }, [paused, go, index])

  // Tastatur
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.code === 'Space') {
        e.preventDefault()
        e.stopPropagation()
        setPaused((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [go, onClose])

  const slide = slides[index]
  return (
    <div className="story-overlay" role="dialog" aria-modal="true" aria-label="Field Report">
      <div className={`story theme-${slide.theme}`}>
        <div className="story-progress">
          {slides.map((s, i) => (
            <span key={s.key} className="story-seg">
              <span style={{ width: `${i < index ? 100 : i === index ? (elapsed / SLIDE_MS) * 100 : 0}%` }} />
            </span>
          ))}
        </div>
        <div className="story-top">
          <button className="icon-btn" onClick={() => setPaused((p) => !p)} aria-label={paused ? t('player.play') : t('player.pause')}>
            {paused ? <IconPlay size={16} /> : <IconPause size={16} />}
          </button>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}><IconX size={18} /></button>
        </div>
        <button className="story-nav prev" onClick={() => go(-1)} aria-label={t('report.story.prev')} />
        <button className="story-nav next" onClick={() => go(1)} aria-label={t('report.story.next')} />
        <div className="story-body" key={slide.key}>{slide.body}</div>
      </div>
    </div>
  )
}
