import { useEffect, useId, useRef, useState } from 'react'

export interface Point {
  date: string
  value: number
}

export const nf = new Intl.NumberFormat('en-MY')
export const compact = (n: number) =>
  n >= 10_000 ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : nf.format(n)
export const rm = (sen: number) =>
  `RM${(sen / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const shortDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => e && setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function niceMax(max: number) {
  if (max <= 4) return 4
  const pow = 10 ** Math.floor(Math.log10(max))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s * 4 >= max) ?? pow * 10
  return step * 4
}

export interface Series {
  name: string
  color: string
  points: Point[]
}

export function LineChart({
  title,
  series,
  format = nf.format,
  tick = compact,
  height = 220,
}: {
  title: string
  series: Series[]
  format?: (n: number) => string
  tick?: (n: number) => string
  height?: number
}) {
  const [ref, width] = useWidth()
  const [index, setIndex] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const id = useId()
  const n = series[0]?.points.length ?? 0
  const pad = { l: 44, r: 16, t: 12, b: 26 }
  const top = niceMax(Math.max(0, ...series.flatMap((s) => s.points.map((p) => p.value))))
  const w = Math.max(width, 240)
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (w - pad.l - pad.r))
  const y = (v: number) => pad.t + (1 - v / top) * (height - pad.t - pad.b)
  const ticks = [0, 1, 2, 3, 4].map((t) => (top / 4) * t)
  const labelAt = [0, Math.floor((n - 1) / 2), n - 1]
  const empty = series.every((s) => s.points.every((p) => p.value === 0))

  function move(clientX: number, box: DOMRect) {
    if (n < 1) return
    const rel = (clientX - box.left - pad.l) / Math.max(1, w - pad.l - pad.r)
    setIndex(Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1)))))
  }

  const path = (s: Series) =>
    s.points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
  const area = (s: Series) => `${path(s)} L${x(n - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`
  const at = index === null ? null : index
  const tipLeft = at === null ? 0 : x(at) > w * 0.6 ? x(at) - 12 : x(at) + 12

  return (
    <figure className="chart" ref={ref} aria-labelledby={`${id}-t`}>
      <figcaption className="chart-head">
        <span id={`${id}-t`} className="chart-title">
          {title}
        </span>
        {series.length > 1 && (
          <ul className="legend" aria-label="Series">
            {series.map((s) => (
              <li key={s.name}>
                <i className="key" style={{ background: s.color }} aria-hidden="true" />
                {s.name}
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="a-link" aria-pressed={table} onClick={() => setTable((t) => !t)}>
          {table ? 'Show chart' : 'Show table'}
        </button>
      </figcaption>

      {table ? (
        <div className="table-wrap" style={{ maxHeight: height }}>
          <table className="a-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                {series.map((s) => (
                  <th key={s.name} scope="col" className="num">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series[0]?.points.map((p, i) => (
                <tr key={p.date}>
                  <th scope="row">{shortDate(p.date)}</th>
                  {series.map((s) => (
                    <td key={s.name} className="num">
                      {format(s.points[i]?.value ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="plot" style={{ height }}>
          {width > 0 && (
            <svg
              width={w}
              height={height}
              role="application"
              aria-roledescription="line chart"
              aria-label={`${title}. ${empty ? 'No data in this range.' : 'Arrow keys move through days.'}`}
              onPointerMove={(e) => move(e.clientX, e.currentTarget.getBoundingClientRect())}
              onPointerLeave={() => setIndex(null)}
              onFocus={() => setIndex((i) => i ?? n - 1)}
              onBlur={() => setIndex(null)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, (i ?? n - 1) - 1))
                else if (e.key === 'ArrowRight') setIndex((i) => Math.min(n - 1, (i ?? n - 1) + 1))
                else if (e.key === 'Escape') setIndex(null)
                else return
                e.preventDefault()
              }}
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line className="grid" x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} />
                  <text className="axis" x={pad.l - 8} y={y(t) + 4} textAnchor="end">
                    {tick(t)}
                  </text>
                </g>
              ))}
              {labelAt.map((i, k) => (
                <text
                  key={series[0]?.points[i]?.date ?? k}
                  className="axis"
                  x={x(i)}
                  y={height - 6}
                  textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}
                >
                  {series[0]?.points[i] ? shortDate(series[0].points[i]!.date) : ''}
                </text>
              ))}
              {series.length === 1 && n > 1 && series[0] && (
                <path d={area(series[0])} fill={series[0].color} opacity={0.1} />
              )}
              {n > 1 &&
                series.map((s) => (
                  <path
                    key={s.name}
                    d={path(s)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
              {at !== null && <line className="cross" x1={x(at)} x2={x(at)} y1={pad.t} y2={height - pad.b} />}
              {series.map((s) => {
                const i = at ?? n - 1
                const p = s.points[i]
                return p ? <circle key={s.name} className="dot" cx={x(i)} cy={y(p.value)} r={4} fill={s.color} /> : null
              })}
            </svg>
          )}
          {empty && <p className="plot-empty">Nothing recorded in this range yet.</p>}
          {at !== null && series[0]?.points[at] && (
            <div
              className="tip"
              style={{ left: tipLeft, transform: x(at) > w * 0.6 ? 'translateX(-100%)' : undefined }}
              role="status"
            >
              <div className="tip-date">{shortDate(series[0].points[at]!.date)}</div>
              {series.map((s) => (
                <div key={s.name} className="tip-row">
                  <i className="key line" style={{ background: s.color }} aria-hidden="true" />
                  <strong>{format(s.points[at]?.value ?? 0)}</strong>
                  <span>{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  )
}

export function BarList({
  title,
  rows,
  color,
  format = nf.format,
  empty = 'Nothing recorded in this range yet.',
}: {
  title: string
  rows: { key: string; value: number }[]
  color: string
  format?: (n: number) => string
  empty?: string
}) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <section className="chart" aria-label={title}>
      <h3 className="chart-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="bars">
          {rows.map((r) => (
            <li key={r.key} title={`${r.key}: ${format(r.value)}`}>
              <span className="bar-label">{r.key}</span>
              <span className="bar-track">
                <span className="bar" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} />
              </span>
              <span className="bar-value num">{format(r.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function Columns({
  title,
  points,
  color,
}: {
  title: string
  points: { hour: string; value: number }[]
  color: string
}) {
  const max = Math.max(1, ...points.map((p) => p.value))
  return (
    <section className="chart" aria-label={title}>
      <h3 className="chart-title">{title}</h3>
      <ul className="cols">
        {points.map((p) => (
          <li key={p.hour} title={`${p.hour.slice(11)}:00 · ${p.value}`}>
            <span
              className="col"
              style={{
                height: `${Math.max(p.value ? 6 : 2, (p.value / max) * 100)}%`,
                background: p.value ? color : undefined,
              }}
            />
          </li>
        ))}
      </ul>
      <div className="cols-axis">
        <span>{points[0]?.hour.slice(11)}:00</span>
        <span>now</span>
      </div>
    </section>
  )
}

export function StatTile({
  label,
  value,
  delta,
  hero = false,
  hint,
}: {
  label: string
  value: string
  delta?: { current: number; previous: number }
  hero?: boolean
  hint?: string
}) {
  const change = delta && delta.previous > 0 ? ((delta.current - delta.previous) / delta.previous) * 100 : null
  return (
    <div className={`tile${hero ? ' hero' : ''}`}>
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {delta && (
        <div className={`tile-delta ${change === null || Math.abs(change) < 0.5 ? '' : change >= 0 ? 'up' : 'down'}`}>
          {change === null
            ? delta.current > 0
              ? 'New this period'
              : 'No change'
            : Math.abs(change) < 0.5
              ? 'No change vs previous'
              : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(0)}% vs previous`}
        </div>
      )}
      {hint && <div className="tile-hint">{hint}</div>}
    </div>
  )
}
