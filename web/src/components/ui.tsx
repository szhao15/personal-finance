import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Tag } from '../data'
import { fmt } from '../data'

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span className="logo" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 32 32" width={size * 0.62} height={size * 0.62}>
        <path d="M26 6 5 14.5l9 2.6 2.6 9z" fill="currentColor" />
      </svg>
    </span>
  )
}

/** Dollar amount with a small raised "$", matching the app style. */
export function Money({ value, digits = 2, className }: { value: number; digits?: number; className?: string }) {
  return (
    <span className={`money ${className ?? ''}`}>
      <sup>$</sup>
      {fmt(value, digits)}
    </span>
  )
}

export function TagChip({ tag }: { tag: Tag }) {
  return (
    <span className="tag" style={{ color: tag.color, background: `${tag.color}22` }}>
      <span aria-hidden>{tag.emoji}</span>
      {tag.label.toUpperCase()}
    </span>
  )
}

export function Change({ value }: { value: number }) {
  const up = value >= 0
  return (
    <span className={`change ${up ? 'up' : 'down'}`}>
      {up ? '↗' : '↙'} {Math.abs(value).toFixed(2)}%
    </span>
  )
}

/** Deterministic pseudo-random walk so charts look organic but stay stable between renders. */
export function walk(seed: number, n: number, drift = 0.3) {
  let x = seed * 9301 + 49297
  const rand = () => ((x = (x * 9301 + 49297) % 233280) / 233280)
  const pts: number[] = []
  let v = 50
  for (let i = 0; i < n; i++) {
    v += (rand() - 0.5) * 18 + drift
    pts.push(v)
  }
  return pts
}

function toPath(values: number[], w: number, h: number, pad = 4) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = pad + (1 - (v - min) / span) * (h - pad * 2)
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

export function Sparkline({ seed, up, width = 120, height = 48 }: { seed: number; up: boolean; width?: number; height?: number }) {
  const values = walk(seed, 28, up ? 1.4 : -1.4)
  const d = toPath(values, width, height)
  const color = up ? 'var(--green)' : 'var(--red)'
  const id = `spark-${seed}`
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.25" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

/** Spending line: red when over pace, through yellow, to green when under. Draws itself on reveal. */
export function SpendingLine({ label = '$125 under', compact = false }: { label?: string; compact?: boolean }) {
  const w = 400
  const h = 160
  const pts: [number, number][] = [
    [0, 150], [30, 154], [60, 150], [85, 128], [105, 92], [125, 104], [150, 112], [175, 98],
    [200, 112], [230, 66], [255, 104], [280, 92], [310, 96], [335, 82], [360, 64], [385, 52], [400, 54],
  ]
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ')
  const [ex, ey] = pts[pts.length - 2]
  const [ref, visible] = useReveal<HTMLDivElement>(0.3)
  return (
    <div ref={ref} className={`spend-line ${compact ? 'compact' : ''} ${visible ? 'go' : ''}`}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="spendGrad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#40bf40" />
            <stop offset="0.22" stopColor="#f04242" />
            <stop offset="0.45" stopColor="#fece4c" />
            <stop offset="0.6" stopColor="#40bf40" />
          </linearGradient>
        </defs>
        <line x1="0" y1="150" x2={w} y2="40" className="pace" />
        <path d={d} className="draw" fill="none" stroke="url(#spendGrad)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" pathLength={1} />
        <circle cx={ex} cy={ey} r="6" className="dot" />
      </svg>
      <span className="under-badge" style={{ left: `${(ex / w) * 100}%`, top: `${(ey / h) * 100}%` }}>
        {label}
      </span>
    </div>
  )
}

export function Laurel({ children }: { children: ReactNode }) {
  // Leaves placed along an arc; the right branch is the mirrored left one.
  const leaves = Array.from({ length: 6 }, (_, i) => {
    const a = ((115 + i * 27) * Math.PI) / 180
    const cx = 26 + 20 * Math.cos(a)
    const cy = 30 + 24 * Math.sin(a)
    return { cx, cy, rot: (a * 180) / Math.PI + 60 }
  })
  const branch = (flip: boolean) => (
    <svg viewBox="0 0 28 60" className="laurel-leaf" style={flip ? { transform: 'scaleX(-1)' } : undefined} aria-hidden>
      {leaves.map((l, i) => (
        <ellipse key={i} cx={l.cx} cy={l.cy} rx="2.6" ry="5.5" transform={`rotate(${l.rot} ${l.cx} ${l.cy})`} fill="currentColor" />
      ))}
    </svg>
  )
  return (
    <div className="laurel">
      {branch(false)}
      <span>{children}</span>
      {branch(true)}
    </div>
  )
}

/** Adds "is-visible" when the element scrolls into view. */
export function useReveal<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])
  return [ref, visible] as const
}

export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const [ref, visible] = useReveal<HTMLDivElement>(0.15)
  return (
    <div ref={ref} className={`reveal ${visible ? 'is-visible' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}

export function GetStarted({ big = false }: { big?: boolean }) {
  return (
    <a href="#pricing" className={`btn-primary ${big ? 'big' : ''}`}>
      <span className="btn-icon">
        <svg viewBox="0 0 32 32" width="16" height="16" aria-hidden>
          <path d="M26 6 5 14.5l9 2.6 2.6 9z" fill="currentColor" />
        </svg>
      </span>
      Get started
    </a>
  )
}
