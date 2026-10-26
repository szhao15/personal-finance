import { useState } from 'react'
import { BRAND, BRAND_SHORT, footerLinks, pills, reviews } from '../data'
import { DesktopDashboard, PhoneApp } from './Devices'
import { GetStarted, Logo, Reveal } from './ui'

// Yearly price is from the live site; the monthly price wasn't visible there, so it's a placeholder.
const PLANS = {
  yearly: { perMonth: '7.92', note: '$95 billed yearly' },
  monthly: { perMonth: '13', note: 'billed monthly' },
}

export function Pricing() {
  const [yearly, setYearly] = useState(true)
  const plan = yearly ? PLANS.yearly : PLANS.monthly
  const [whyOpen, setWhyOpen] = useState(false)
  return (
    <section className="pricing" id="pricing">
      <Reveal>
        <h2 className="section-title">Honest and<br />thoughtful pricing</h2>
      </Reveal>
      <div className="pricing-grid">
        <Reveal className="card trial">
          <div className="card-copy">
            <h4>Test drive for free</h4>
            <p>Take {BRAND_SHORT} for a spin before you connect a single account. If you like what you see, you can start a free trial.</p>
            <GetStarted big />
          </div>
          <div className="trial-phone">
            <PhoneApp demo />
          </div>
        </Reveal>
        <Reveal className="card price" delay={100}>
          <div className="price-amount">
            <sup>$</sup>{plan.perMonth}<span>/mo</span>
          </div>
          <div className="muted">{plan.note}</div>
          <div className="toggle-row">
            <button className={yearly ? 'on' : ''} onClick={() => setYearly(true)}>Yearly</button>
            <button
              className={`switch ${yearly ? '' : 'right'}`}
              role="switch"
              aria-checked={!yearly}
              aria-label="Toggle monthly billing"
              onClick={() => setYearly((y) => !y)}
            >
              <i />
            </button>
            <button className={!yearly ? 'on' : ''} onClick={() => setYearly(false)}>Monthly</button>
          </div>
          <p className="muted">No ads, no hidden fees.</p>
          <p className="muted">Your data stays private, we focus on building the best product for you.</p>
          <button className="link" onClick={() => setWhyOpen((o) => !o)}>Why isn't {BRAND_SHORT} free?</button>
          {whyOpen && (
            <p className="why">
              Free finance apps make money by selling ads or your data. We charge a fair subscription so the only
              thing we're optimizing for is a great product.
            </p>
          )}
        </Reveal>
      </div>
    </section>
  )
}

const Stars = () => <div className="stars" aria-label="5 stars">★★★★★</div>

export function Reviews() {
  return (
    <section className="reviews" id="reviews">
      <Reveal>
        <h2 className="section-title">People love {BRAND}</h2>
      </Reveal>
      <div className="masonry">
        {reviews.map((r, i) => (
          <Reveal className="review" key={r.name} delay={(i % 3) * 80}>
            {r.stars ? (
              <>
                <Stars />
                <small className="muted">{r.name}</small>
                <h5>{r.title}</h5>
              </>
            ) : (
              <div className="reviewer">
                <span className="avatar" style={{ background: r.avatar }}>{r.name[0]}</span>
                <div>
                  <b>{r.name}</b>
                  <small className="muted">{r.handle}</small>
                </div>
              </div>
            )}
            <p>{r.body}</p>
          </Reveal>
        ))}
      </div>
      <div className="masonry-fade" aria-hidden />
    </section>
  )
}

export function PeaceOfMind() {
  return (
    <section className="peace">
      <Reveal className="peace-copy">
        <h2>Gain peace<br />of mind</h2>
        <p>Welcome to {BRAND},<br />the money app that just works.</p>
        <GetStarted big />
      </Reveal>
      <Reveal className="peace-devices" delay={120}>
        <div className="laptop">
          <div className="laptop-screen"><DesktopDashboard /></div>
          <div className="laptop-base" />
        </div>
        <div className="peace-phone"><PhoneApp /></div>
      </Reveal>
    </section>
  )
}

const pileRot = [-50, 0, -14, 0, 38, 0, 30]

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <Logo size={44} />
          <div className="legal">
            <span className="privacy-choice">✓✕</span> Your Privacy Choices
            <p>© Copyright {new Date().getFullYear()} {BRAND}.</p>
          </div>
        </div>
        {Object.entries(footerLinks).map(([group, links]) => (
          <div key={group} className="footer-col">
            <b>{group}</b>
            {links.map((l) => (
              <a key={l} href="#top">{l}</a>
            ))}
          </div>
        ))}
      </div>
      <Reveal className="pill-pile">
        {pills.map((p, i) => (
          <span
            key={p.label}
            className="cat-pill drop"
            style={{ background: p.color, ['--rot' as string]: `${pileRot[i]}deg`, animationDelay: `${i * 90}ms` }}
          >
            <span className="cat-emoji">{p.emoji}</span>
            {p.label.toUpperCase()}
          </span>
        ))}
      </Reveal>
    </footer>
  )
}
