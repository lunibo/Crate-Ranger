import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Diagramm-Bausteine für Field Report – nach den Dataviz-Regeln:
 * eine Farbe für Größen (Akzent), schmale Säulen mit 4px-Rundung an der Spitze, Haarlinien-Raster,
 * nur der Spitzenwert direkt beschriftet, Hover-Tooltip mit großer Trefferfläche, Tabellenansicht.
 */

export interface Datum {
  /** kurze Achsenbeschriftung */
  label: string
  /** vollständige Bezeichnung für Tooltip/Tabelle */
  name: string
  value: number
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)))
    ro.observe(ref.current)
    setW(ref.current.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

function niceMax(v: number): number {
  if (v <= 0) return 1
  const exp = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * exp >= v) return m * exp
  return 10 * exp
}

/** Säule mit 4px-Rundung oben, gerade an der Grundlinie. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

export function ColumnChart({
  data,
  format,
  height = 190,
  labelEvery,
  ariaLabel
}: {
  data: Datum[]
  format: (v: number) => string
  height?: number
  /** jede n-te Achsenbeschriftung zeigen (Standard: automatisch nach Breite) */
  labelEvery?: number
  ariaLabel: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const left = 44
  const right = 8
  const top = 22
  const bottom = 24
  const plotW = Math.max(0, width - left - right)
  const plotH = height - top - bottom
  const max = niceMax(Math.max(...data.map((d) => d.value), 0))
  const band = data.length ? plotW / data.length : 0
  const barW = Math.max(2, Math.min(24, band * 0.62))
  const peak = data.reduce((m, d, i) => (d.value > (data[m]?.value ?? -1) ? i : m), 0)
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 44))))
  const y = (v: number): number => top + plotH - (v / max) * plotH
  const ticks = [0, max / 2, max]

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={width - right} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
              <text x={left - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">{format(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = left + i * band + (band - barW) / 2
            const h = Math.max(0, top + plotH - y(d.value))
            return (
              <g key={d.name}>
                {h > 0 && <path d={columnPath(x, y(d.value), barW, h)} className={`col ${hover === i ? 'hover' : ''}`} />}
                {i % every === 0 && (
                  <text x={x + barW / 2} y={height - 6} className="tick" textAnchor="middle">{d.label}</text>
                )}
                {i === peak && d.value > 0 && hover === null && (
                  <text x={x + barW / 2} y={y(d.value) - 7} className="peak" textAnchor="middle">{format(d.value)}</text>
                )}
                {/* Trefferfläche: ganzes Band */}
                <rect x={left + i * band} y={top} width={band} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            )
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <div
          className="chart-tip"
          style={{ left: Math.min(Math.max(left + hover * band + band / 2, 70), width - 70), top: Math.max(0, y(data[hover].value) - 52) }}
        >
          <div className="tip-name">{data[hover].name}</div>
          <div className="tip-value">{format(data[hover].value)}</div>
        </div>
      )}
    </div>
  )
}

/** Sortierte horizontale Balken (Anteile), eine Farbe, Wert an der Balkenspitze. */
export function RankedBars({ rows, format }: { rows: { name: ReactNode; key: string; value: number; note?: string }[]; format: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1
  return (
    <div className="ranked">
      {rows.map((r) => (
        <div className="ranked-row" key={r.key} title={`${typeof r.name === 'string' ? r.name : r.key}: ${format(r.value)}${r.note ? ` · ${r.note}` : ''}`}>
          <div className="ranked-name">{r.name}</div>
          <div className="ranked-track">
            <div className="ranked-bar" style={{ width: `calc((100% - 132px) * ${r.value / max})` }} />
            <span className="ranked-value">{format(r.value)}{r.note ? <span className="muted"> · {r.note}</span> : null}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Hoher segmentierter Balken (ein Ganzes, ≤ 6 Teile) mit Legende. Farbe folgt der Kategorie. */
export function SegmentedBar({ parts, ariaLabel, format }: { parts: { key: string; name: string; share: number; color: string }[]; ariaLabel: string; format: (share: number) => string }) {
  const visible = parts.filter((p) => p.share > 0)
  return (
    <div className="segmented" role="img" aria-label={ariaLabel}>
      <div className="seg-bar">
        {visible.map((p) => (
          <div key={p.key} className="seg" style={{ flexGrow: p.share, background: p.color }} title={`${p.name}: ${format(p.share)}`}>
            {p.share >= 0.08 && <span>{format(p.share)}</span>}
          </div>
        ))}
      </div>
      <div className="legend">
        {visible.map((p) => (
          <span key={p.key} className="legend-item"><span className="swatch" style={{ background: p.color }} />{p.name}</span>
        ))}
      </div>
    </div>
  )
}

/** Karte mit Titel und umschaltbarer Tabellenansicht (Werte nie nur über Farbe/Hover lesbar). */
export function ChartCard({
  title,
  subtitle,
  table,
  children,
  className
}: {
  title: string
  subtitle?: ReactNode
  table?: { head: [string, string]; rows: [string, string][] }
  children: ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  const [showTable, setShowTable] = useState(false)
  useEffect(() => setShowTable(false), [table?.rows.length])
  return (
    <section className={`chart-card ${className ?? ''}`}>
      <header className="chart-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <div className="chart-sub">{subtitle}</div>}
        </div>
        {table && (
          <button className="btn btn-ghost btn-sm" onClick={() => setShowTable((s) => !s)} aria-pressed={showTable}>
            {showTable ? t('report.showChart') : t('report.showTable')}
          </button>
        )}
      </header>
      {showTable && table ? (
        <div className="chart-table-wrap">
          <table className="chart-table">
            <thead><tr><th>{table.head[0]}</th><th>{table.head[1]}</th></tr></thead>
            <tbody>{table.rows.map(([a, b], i) => <tr key={i}><td>{a}</td><td>{b}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  )
}
