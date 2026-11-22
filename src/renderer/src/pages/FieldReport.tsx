import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { computeFieldReport, makePeriod, yearsWithData, type PeriodKind, type FieldReport } from '@shared/fieldReport'
import { timelineData, useReportFormat, type ReportFormat } from '../lib/reportFormat'
import { artistImage, releaseCover, tagDistribution } from '../lib/api'
import { capitalize, fmtNumber } from '../lib/format'
import { useSettings } from '../lib/stores'
import { ChartCard, ColumnChart, RankedBars, SegmentedBar, type Datum } from '../components/Charts'
import { Chip, Cover, Empty, ErrorBox, Spinner } from '../components/Common'
import { CoverPlayButton } from '../components/CoverPlayButton'
import { IconPlay } from '../components/Icons'
import { FieldReportStory } from '../components/FieldReportStory'

/** Farbe folgt dem Label (feste Zuordnung, validiert gegen den dunklen Kartengrund). */
export const BRAND_COLORS: Record<string, string> = { Uncaged: '#3987e5', Instinct: '#d95926', Silk: '#199e70', other: '#5b6578' }

export function FieldReportPage() {
  const { t } = useTranslation()
  const f = useReportFormat()
  const statsEnabled = useSettings((s) => s.settings?.statsEnabled ?? true)
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => window.ss.stats.get(), staleTime: 0, refetchOnMount: 'always' })
  const dist = useQuery({ queryKey: ['tag-dist'], queryFn: tagDistribution, staleTime: 3600_000 })
  const years = useMemo(() => yearsWithData(stats.data?.plays ?? []), [stats.data])
  const [kind, setKind] = useState<PeriodKind>('year')
  const [year, setYear] = useState<number | undefined>(undefined)
  const [story, setStory] = useState(false)
  const activeYear = year ?? years[0] ?? new Date().getFullYear()
  const categories = useMemo(() => (dist.data ? new Map(dist.data.map((d) => [d.Tag.toLowerCase(), d.Category])) : undefined), [dist.data])
  const w = useMemo(
    () => (stats.data ? computeFieldReport(stats.data, makePeriod(kind, Date.now(), activeYear), categories) : null),
    [stats.data, kind, activeYear, categories]
  )

  if (stats.isLoading) return <div className="page"><Spinner /></div>
  if (stats.error) return <div className="page"><ErrorBox error={stats.error} /></div>

  const periodTitle = kind === 'year' ? t('report.periodYear', { year: activeYear }) : kind === 'last30' ? t('report.periodLast30') : t('report.periodAll')

  return (
    <div className="page report">
      <div className="report-head">
        <div>
          <div className="hero-kind">Crate Ranger Field Report</div>
          <h1 className="page-title">{periodTitle}</h1>
        </div>
        <div className="report-controls">
          {years.map((y) => (
            <Chip key={y} active={kind === 'year' && activeYear === y} onClick={() => { setKind('year'); setYear(y) }}>{y}</Chip>
          ))}
          <Chip active={kind === 'last30'} onClick={() => setKind('last30')}>{t('report.last30')}</Chip>
          <Chip active={kind === 'all'} onClick={() => setKind('all')}>{t('report.all')}</Chip>
          {w && !w.empty && (
            <button className="btn btn-primary" onClick={() => setStory(true)}><IconPlay size={14} /> {t('report.playStory')}</button>
          )}
        </div>
      </div>

      {!w || w.empty ? (
        <Empty>
          {statsEnabled ? t('report.empty') : t('report.disabled')}{' '}
          {!statsEnabled && <Link to="/settings">{t('nav.settings')}</Link>}
        </Empty>
      ) : (
        <FieldReportBody w={w} f={f} />
      )}
      <p className="muted small report-privacy">{t('report.privacy')}</p>
      {story && w && !w.empty && <FieldReportStory w={w} title={periodTitle} onClose={() => setStory(false)} />}
    </div>
  )
}

function FieldReportBody({ w, f }: { w: FieldReport; f: ReportFormat }) {
  const { t } = useTranslation()
  const nav = useNavigate()
  const tl = timelineData(w, f)
  const hours: Datum[] = w.byHour.map((b) => ({ label: b.value % 6 === 0 ? f.hour(b.value) : '', name: `${f.hour(b.value)} – ${f.hour((b.value + 1) % 24)}`, value: b.minutes }))
  const weekdays: Datum[] = w.byWeekday.map((b) => ({ label: f.weekday(b.value), name: f.weekday(b.value, 'long'), value: b.minutes }))
  const tempo: Datum[] = w.tempo.buckets.map((b) => ({ label: b.label, name: `${b.label} BPM`, value: b.minutes }))
  const yearsData: Datum[] = w.releaseYears.buckets.map((b) => ({ label: b.key, name: b.key, value: b.minutes }))
  const tableMinutes = (head: string, data: Datum[]) => ({ head: [head, t('report.minutes')] as [string, string], rows: data.map((d) => [d.name, f.minutes(d.value)] as [string, string]) })
  const top = w.topArtists[0]

  return (
    <>
      {/* Hero + Kennzahlen */}
      <section className="report-hero">
        <div className="hero-figure">
          <div className="hero-number">{f.nf(Math.round(w.totals.minutes))}</div>
          <div className="hero-caption">{t('report.minutesListened')}</div>
          <div className="muted">{t('report.minutesEquivalent', { hours: f.nf(w.totals.minutes / 60, 1), days: f.nf(w.totals.minutes / 1440, 1) })}</div>
        </div>
        <div className="kpis">
          {[
            [t('report.kpi.plays'), fmtNumber(w.totals.plays)],
            [t('report.kpi.tracks'), fmtNumber(w.totals.tracks)],
            [t('report.kpi.artists'), fmtNumber(w.totals.artists)],
            [t('report.kpi.releases'), fmtNumber(w.totals.releases)],
            [t('report.kpi.activeDays'), fmtNumber(w.totals.activeDays)],
            [t('report.kpi.streak'), t('report.daysValue', { count: w.longestStreak.days })]
          ].map(([label, value]) => (
            <div className="kpi" key={label}><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div></div>
          ))}
        </div>
      </section>

      {/* Ranger-Typ */}
      <section className={`persona persona-${w.persona}`}>
        <div className="persona-kicker">{t('report.personaKicker')}</div>
        <div className="persona-title">{t(`report.persona.${w.persona}.title`)}</div>
        <p>{t(`report.persona.${w.persona}.text`, { hour: w.peakHour !== null ? f.hour(w.peakHour) : '', artist: top?.name ?? '', bpm: Math.round(w.tempo.avgBpm), genre: w.genres[0]?.name ?? '' })}</p>
      </section>

      {/* Top-Listen */}
      <div className="report-grid two">
        <section className="chart-card">
          <header className="chart-head"><h3>{t('report.topArtists')}</h3></header>
          <ol className="top-list">
            {w.topArtists.slice(0, 5).map((a, i) => (
              <li key={a.id || a.name} className={i === 0 ? 'first' : ''}>
                <span className="rank">{i + 1}</span>
                <Cover src={a.id ? artistImage(a.id, 160) : undefined} alt={a.name} round size={i === 0 ? 64 : 44} />
                <div className="top-text">
                  {a.uri || a.id ? <Link to={`/artist/${a.uri || a.id}`} className="strong">{a.name}</Link> : <span className="strong">{a.name}</span>}
                  <div className="muted small">{f.minutes(a.minutes)} · {t('report.playsValue', { count: a.plays })}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="chart-card">
          <header className="chart-head"><h3>{t('report.topTracks')}</h3></header>
          <ol className="top-list">
            {w.topTracks.slice(0, 5).map((tr, i) => (
              <li key={tr.trackId} className={i === 0 ? 'first' : ''}>
                <span className="rank">{i + 1}</span>
                <Link to={`/release/${tr.releaseId}`}><Cover src={releaseCover(tr.releaseId, 160)} alt={tr.title} size={i === 0 ? 64 : 44} /></Link>
                <div className="top-text">
                  <Link to={`/track/${tr.trackId}`} className="strong">{tr.title}{tr.version ? ` (${tr.version})` : ''}</Link>
                  <div className="muted small">{tr.artists} · {t('report.playsValue', { count: tr.plays })}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="chart-card">
        <header className="chart-head"><h3>{t('report.topReleases')}</h3></header>
        <div className="release-strip">
          {w.topReleases.slice(0, 6).map((r, i) => (
            <div key={r.releaseId} className="strip-item clickable" onClick={() => nav(`/release/${r.releaseId}`)}>
              <div className="card-cover">
                <Cover src={releaseCover(r.releaseId, 300)} alt={r.title} />
                <span className="strip-rank">{i + 1}</span>
                <CoverPlayButton releaseId={r.releaseId} title={r.title} />
              </div>
              <div className="card-title">{r.title}</div>
              <div className="card-sub">{f.minutes(r.minutes)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Zeit */}
      <ChartCard
        title={w.timeline.unit === 'day' ? t('report.byDay') : t('report.byMonth')}
        subtitle={w.busiestDay ? t('report.busiestDay', { date: f.date(w.busiestDay.day), minutes: f.minutes(w.busiestDay.minutes) }) : undefined}
        table={tableMinutes(w.timeline.unit === 'day' ? t('report.day') : t('report.month'), tl)}
      >
        <ColumnChart data={tl} format={f.axisMinutes} ariaLabel={t('report.byMonth')} />
      </ChartCard>

      <div className="report-grid two">
        <ChartCard
          title={t('report.clock')}
          subtitle={w.peakHour !== null ? t('report.peakHour', { hour: f.hour(w.peakHour) }) : undefined}
          table={tableMinutes(t('report.hour'), hours)}
        >
          <ColumnChart data={hours} format={f.axisMinutes} labelEvery={1} ariaLabel={t('report.clock')} />
        </ChartCard>
        <ChartCard
          title={t('report.weekdays')}
          subtitle={w.peakWeekday !== null ? t('report.peakWeekday', { day: f.weekday(w.peakWeekday, 'long') }) : undefined}
          table={tableMinutes(t('report.weekday'), weekdays)}
        >
          <ColumnChart data={weekdays} format={f.axisMinutes} labelEvery={1} ariaLabel={t('report.weekdays')} />
        </ChartCard>
      </div>

      {/* Geschmack */}
      <div className="report-grid two">
        <ChartCard title={t('report.genres')} subtitle={t('report.byListeningTime')}>
          <RankedBars rows={w.genres.map((g) => ({ key: g.name, name: g.name, value: g.minutes, note: f.percent(g.share) }))} format={f.minutes} />
        </ChartCard>
        <ChartCard title={t('report.moods')} subtitle={t('report.byListeningTime')}>
          {w.moods.length ? (
            <RankedBars rows={w.moods.map((m) => ({ key: m.name, name: capitalize(m.name), value: m.minutes, note: f.percent(m.share) }))} format={f.minutes} />
          ) : <Empty>{t('report.noMoods')}</Empty>}
        </ChartCard>
      </div>

      <div className="report-grid two">
        <ChartCard
          title={t('report.labels')}
          subtitle={t('report.labelsSub')}
          table={{ head: [t('report.label'), t('report.share')], rows: w.brands.map((b) => [b.name === 'other' ? t('report.otherLabels') : b.name, `${f.percent(b.share)} · ${f.minutes(b.minutes)}`]) }}
        >
          <SegmentedBar
            format={f.percent}
            ariaLabel={t('report.labels')}
            parts={['Uncaged', 'Instinct', 'Silk', 'other'].map((k) => {
              const b = w.brands.find((x) => x.name === k)
              return { key: k, name: k === 'other' ? t('report.otherLabels') : k, share: b?.share ?? 0, color: BRAND_COLORS[k] }
            })}
          />
        </ChartCard>
        <ChartCard
          title={t('report.tempo')}
          subtitle={w.tempo.avgBpm ? t('report.avgBpm', { bpm: Math.round(w.tempo.avgBpm) }) : undefined}
          table={tableMinutes('BPM', tempo)}
        >
          <ColumnChart data={tempo} format={f.axisMinutes} labelEvery={1} height={170} ariaLabel={t('report.tempo')} />
        </ChartCard>
      </div>

      <div className="report-grid two">
        <ChartCard
          title={t('report.eras')}
          subtitle={w.releaseYears.medianYear ? t('report.medianYear', { year: w.releaseYears.medianYear, fresh: f.percent(w.releaseYears.freshShare) }) : undefined}
          table={tableMinutes(t('report.releaseYear'), yearsData)}
        >
          <ColumnChart data={yearsData} format={f.axisMinutes} height={170} ariaLabel={t('report.eras')} />
        </ChartCard>
        <section className="chart-card">
          <header className="chart-head">
            <div>
              <h3>{t('report.discoveries')}</h3>
              <div className="chart-sub">{t('report.discoveriesSub', { count: w.discoveries.count })}</div>
            </div>
          </header>
          <div className="discover-number">{fmtNumber(w.discoveries.count)}</div>
          <div className="discover-list">
            {w.discoveries.top.map((a) => (
              a.uri || a.id
                ? <Link key={a.id || a.name} to={`/artist/${a.uri || a.id}`} className="tag">{a.name}</Link>
                : <span key={a.name} className="tag">{a.name}</span>
            ))}
          </div>
        </section>
      </div>

      {/* Gewohnheiten */}
      <section className="chart-card">
        <header className="chart-head"><h3>{t('report.habits')}</h3></header>
        <div className="habits">
          <Habit label={t('report.habit.completion')} value={f.percent(w.habits.completionRate)} />
          <Habit label={t('report.habit.skips')} value={f.percent(w.habits.skipRate)} />
          <Habit label={t('report.habit.creatorSafe')} value={f.percent(w.habits.creatorSafeShare)} />
          <Habit label={t('report.habit.favorites')} value={fmtNumber(w.habits.favoritesAdded)} />
          <Habit label={t('report.habit.downloads')} value={fmtNumber(w.habits.downloads)} />
          <Habit label={t('report.habit.searches')} value={fmtNumber(w.habits.searches + w.habits.aiSearches)} note={w.habits.aiSearches ? t('report.habit.aiSearches', { count: w.habits.aiSearches }) : undefined} />
          <Habit label={t('report.habit.topSearch')} value={w.habits.topSearch ? f.quoted(w.habits.topSearch) : '—'} />
          <Habit label={t('report.habit.appTime')} value={t('report.hoursValue', { value: f.nf(w.habits.appMinutes / 60, 1) })} />
        </div>
        <div className="source-split">
          <div className="muted small">{t('report.habit.sources')}</div>
          <div className="thin-bar" role="img" aria-label={`${t('report.habit.local')}: ${f.percent(w.habits.localShare)}`}>
            <span style={{ flexGrow: w.habits.localShare, background: 'var(--accent)' }} />
            <span style={{ flexGrow: 1 - w.habits.localShare, background: '#5b6578' }} />
          </div>
          <div className="legend">
            <span className="legend-item"><span className="swatch" style={{ background: 'var(--accent)' }} />{t('report.habit.local')} {f.percent(w.habits.localShare)}</span>
            <span className="legend-item"><span className="swatch" style={{ background: '#5b6578' }} />{t('report.habit.stream')} {f.percent(1 - w.habits.localShare)}</span>
          </div>
        </div>
      </section>
    </>
  )
}

function Habit({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {note && <div className="muted small">{note}</div>}
    </div>
  )
}
