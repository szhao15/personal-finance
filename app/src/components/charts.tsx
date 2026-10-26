import { useId, useMemo, useRef, useState } from 'react'

export type Series = { values: (number | null)[]; color: string; dashed?: boolean; fill?: boolean; label?: string }

/**
 * Responsive SVG line chart with a hover crosshair. Values share one y-scale.
 * `null` values end a line (e.g. future days this month).
 */
export function LineChart({
  series, labels, height = 180, format = String, baseline,
}: {
  series: Series[]
  labels: string[]
  height?: number
  format?: (n: number) => string
  /** Optional horizontal reference line (e.g. a budget). */
  baseline?: { value: number; label: string }
}) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const W = 600
  const H = height
  const pad = 8
  const n = labels.length

  const { min, max } = useMemo(() => {
    const all = series.flatMap((s) => s.values.filter((v): v is number => v != null))
    if (baseline) all.push(baseline.value)
    let lo = Math.min(...all)
    let hi = Math.max(...all)
    if (!isFinite(lo)) { lo = 0; hi = 1 }
    if (hi === lo) hi = lo + 1
    const span = hi - lo
    return { min: lo - span * 0.08, max: hi + span * 0.08 }
  }, [series, baseline])

  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W)
  const y = (v: number) => pad + (1 - (v - min) / (max - min)) * (H - pad * 2)

  const path = (vals: (number | null)[]) => {
    let d = ''
    let pen = false
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `
      pen = true
    })
    return d
  }
  const lastIdx = (vals: (number | null)[]) => {
    for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return i
    return -1
  }

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }

  return (
    <div className="chart" ref={ref} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <defs>
          {series.map((s, k) => (
            <linearGradient key={k} id={`${id}-g${k}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="1" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {baseline && <line x1="0" x2={W} y1={y(baseline.value)} y2={y(baseline.value)} className="chart-baseline" />}
        {series.map((s, k) => {
          const d = path(s.values)
          const li = lastIdx(s.values)
          return (
            <g key={k}>
              {s.fill && li > 0 && <path d={`${d} L${x(li)},${H} L${x(s.values.findIndex((v) => v != null))},${H} Z`} fill={`url(#${id}-g${k})`} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth={s.dashed ? 1.6 : 2.4} strokeDasharray={s.dashed ? '5 5' : undefined} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </g>
          )
        })}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} className="chart-cross" />}
      </svg>
      {/* Dots and tooltip are HTML so they stay round on a stretched SVG. */}
      {series.map((s, k) => {
        const i = hover ?? (s.dashed ? -1 : lastIdx(s.values))
        const v = i >= 0 ? s.values[i] : null
        if (v == null) return null
        return <span key={k} className="chart-dot" style={{ left: `${(x(i) / W) * 100}%`, top: `${(y(v) / H) * 100}%`, borderColor: s.color }} />
      })}
      {baseline && <span className="chart-baseline-label" style={{ top: `${(y(baseline.value) / H) * 100}%` }}>{baseline.label}</span>}
      {hover != null && (
        <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <div className="muted">{labels[hover]}</div>
          {series.map((s, k) =>
            s.values[hover] != null ? (
              <div key={k}>
                <i style={{ background: s.color }} /> {s.label ? `${s.label}: ` : ''}
                <b>{format(s.values[hover]!)}</b>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  )
}

/** Monthly bars (spend) with an optional budget tick on each. */
export function BarChart({
  data, height = 160, format = String,
}: {
  data: { label: string; value: number; budget?: number; highlight?: boolean }[]
  height?: number
  format?: (n: number) => string
}) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.budget ?? 0)))
  return (
    <div className="bars" style={{ height }}>
      {data.map((d, i) => {
        const over = d.budget != null && d.budget > 0 && d.value > d.budget
        return (
          <div className="bar-col" key={i} title={`${d.label}: ${format(d.value)}${d.budget ? ` of ${format(d.budget)}` : ''}`}>
            <div className="bar-track">
              {d.budget ? <span className="bar-budget" style={{ bottom: `${(d.budget / max) * 100}%` }} /> : null}
              <span className={`bar ${over ? 'over' : ''} ${d.highlight ? 'hl' : ''}`} style={{ height: `${(Math.max(d.value, 0) / max) * 100}%` }} />
            </div>
            <small>{d.label}</small>
          </div>
        )
      })}
    </div>
  )
}

/** Circular budget meter: green under budget, yellow close, red over. */
export function Ring({ spent, budget, size = 44, children }: { spent: number; budget: number; size?: number; children?: React.ReactNode }) {
  const ratio = budget > 0 ? spent / budget : 0
  const color = budget <= 0 ? 'var(--muted)' : ratio > 1 ? 'var(--red)' : ratio > 0.85 ? 'var(--yellow)' : 'var(--green)'
  const c = 2 * Math.PI * 16
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="16" className="ring-bg" />
        <circle cx="20" cy="20" r="16" stroke={color} className="ring-fg" strokeDasharray={`${Math.min(ratio, 1) * c} ${c}`} />
      </svg>
      <span className="ring-inner">{children}</span>
    </span>
  )
}

export function Progress({ value, max, thin }: { value: number; max: number; thin?: boolean }) {
  const ratio = max > 0 ? value / max : 0
  const cls = max <= 0 ? '' : ratio > 1 ? 'over' : ratio > 0.85 ? 'near' : ''
  return (
    <div className={`progress ${thin ? 'thin' : ''}`}>
      <span className={cls} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
    </div>
  )
}
