import { useEffect, useRef, useState } from 'react'
import { awards, pills, type Pill } from '../data'
import { DesktopDashboard, PhoneApp } from './Devices'
import { GetStarted, Laurel, Logo, Reveal } from './ui'

export function AnnouncementBar() {
  const [open, setOpen] = useState(true)
  if (!open) return null
  return (
    <div className="announce">
      <a href="#features">Meet your money assistant ▸</a>
      <button aria-label="Dismiss announcement" onClick={() => setOpen(false)}>✕</button>
    </div>
  )
}

export function Nav() {
  const [onLight, setOnLight] = useState(false)
  useEffect(() => {
    // Switch nav contrast while the light "wealth" section is behind it.
    const onScroll = () => {
      const light = document.getElementById('wealth')
      if (!light) return
      const r = light.getBoundingClientRect()
      setOnLight(r.top < 70 && r.bottom > 70)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <nav className={`nav ${onLight ? 'on-light' : ''}`}>
      <div className="nav-pill">
        <a href="#top" aria-label="Home"><Logo size={34} /></a>
        <a href="#features">Features</a>
        <a href="#pricing">Pricing</a>
        <a href="#reviews" className="hide-xs">Reviews</a>
      </div>
      <div className="nav-pill">
        <a href="#login" className="hide-sm">Log in</a>
        <a href="#pricing" className="nav-cta">Get started</a>
      </div>
    </nav>
  )
}

function PillChip({ pill, style }: { pill: Pill; style?: React.CSSProperties }) {
  return (
    <span className="cat-pill" style={{ background: pill.color, ...style }}>
      <span className="cat-emoji" aria-hidden>{pill.emoji}</span>
      {pill.label.toUpperCase()}
    </span>
  )
}

const heroPills = [
  { i: 5, x: 18, y: 2, r: -8, blur: 6, s: 1 },
  { i: 6, x: 74, y: 4, r: 14, blur: 3, s: 1.05 },
  { i: 3, x: 66, y: -2, r: -12, blur: 8, s: 0.9 },
  { i: 2, x: 4, y: 30, r: -6, blur: 2, s: 1 },
  { i: 0, x: 82, y: 44, r: -16, blur: 1, s: 1 },
  { i: 4, x: 9, y: 58, r: -14, blur: 2, s: 1 },
  { i: 1, x: 78, y: 64, r: 16, blur: 3, s: 1.1 },
]

export function Hero() {
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Gentle parallax on the floating pills.
    const onScroll = () => wrap.current?.style.setProperty('--sy', `${window.scrollY}`)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <header className="hero" id="top">
      <div className="hero-pills" ref={wrap} aria-hidden>
        {heroPills.map((p, k) => (
          <div
            key={k}
            className="float"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              filter: `blur(${p.blur}px)`,
              animationDelay: `${k * -1.3}s`,
              ['--depth' as string]: `${0.15 + p.blur * 0.04}`,
            }}
          >
            <PillChip pill={pills[p.i]} style={{ transform: `rotate(${p.r}deg) scale(${p.s})` }} />
          </div>
        ))}
      </div>
      <h1 className="hero-title">
        Your money,
        <br />
        beautifully
        <br />
        organized.
      </h1>
      <p className="hero-sub">
        All of your accounts, spending,
        <br />
        and investments, automatically tracked.
      </p>
      <GetStarted big />
      <div className="awards">
        {awards.map((a) => (
          <Laurel key={a}>{a}</Laurel>
        ))}
      </div>
    </header>
  )
}

const mission =
  'Navigate your finances with confidence. Track spending, budgets, investments, net worth, and get personalized recommendations.'

export function Mission() {
  const ref = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    // Words light up one by one as the section scrolls through the viewport.
    const onScroll = () => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      setProgress(Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.3))))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const words = mission.split(' ')
  return (
    <section className="mission" ref={ref}>
      <Logo size={56} />
      <h2>
        {words.map((w, i) => (
          <span key={i} className={i / words.length < progress ? 'lit' : ''}>
            {w}{' '}
          </span>
        ))}
      </h2>
    </section>
  )
}

export function Platforms() {
  return (
    <section className="platforms">
      <Reveal>
        <h3>Available on iPhone, iPad, Mac, and Web</h3>
      </Reveal>
      <Reveal className="devices" delay={120}>
        <DesktopDashboard />
        <div className="devices-phone">
          <PhoneApp />
        </div>
      </Reveal>
    </section>
  )
}
