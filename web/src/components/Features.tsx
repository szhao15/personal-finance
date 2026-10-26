import { useState } from 'react'
import { accounts, allocation, cashFlow, holdings, reviewTransactions, subscriptions } from '../data'
import { Change, Money, Reveal, SpendingLine, Sparkline, TagChip, useReveal } from './ui'

function Card({ title, body, children, className = '', delay = 0 }: {
  title: string; body: string; children?: React.ReactNode; className?: string; delay?: number
}) {
  return (
    <Reveal className={`card ${className}`} delay={delay}>
      <div className="card-copy">
        <h4>{title}</h4>
        <p>{body}</p>
      </div>
      <div className="card-visual">{children}</div>
    </Reveal>
  )
}

function ReviewList() {
  return (
    <div className="mini-panel review-list">
      <div className="mp-title">Transactions to review</div>
      <div className="mp-day">TODAY</div>
      {reviewTransactions.map((t) => (
        <div className="mp-row" key={t.merchant}>
          <span>{t.merchant}</span>
          <TagChip tag={t.tag} />
        </div>
      ))}
    </div>
  )
}

const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL']
const bars = [22, 38, 14, 20, 8, 6, 5]

function Rollover() {
  const [ref, visible] = useReveal<HTMLDivElement>()
  return (
    <div className={`mini-panel rollover ${visible ? 'grow' : ''}`} ref={ref}>
      <div className="ticket" aria-hidden>🎟️</div>
      <div className="mp-title center">Entertainment</div>
      <div className="ro-stats">
        <div><small>SPENT</small><b><Money value={25.49} /></b><small className="muted">$96.84 under</small></div>
        <div><small>ROLLOVER</small><b><Money value={42.33} /></b><small className="muted">from Feb</small></div>
      </div>
      <div className="ro-bars">
        {bars.map((h, i) => (
          <div key={i} className="ro-col">
            <i style={{ height: `${h * 1.6}px`, background: i < 2 ? 'var(--red)' : 'var(--green)', transitionDelay: `${i * 60}ms` }} />
            <small>{months[i]}</small>
          </div>
        ))}
        <span className="ro-budget">$80.00</span>
      </div>
    </div>
  )
}

function CashFlow() {
  return (
    <div className="cash-chips">
      {[...cashFlow, ...cashFlow].map((c, i) => (
        <div className={`cf-chip ${c.delta < 0 ? 'neg' : ''}`} key={i}>
          <span className="cf-dot" />
          <span aria-hidden>{c.emoji}</span>
          <span>{c.label}</span>
          <b>{c.delta < 0 ? '-' : '+'}${Math.abs(c.delta)}</b>
        </div>
      ))}
    </div>
  )
}

function Subscriptions() {
  return (
    <div className="subs">
      <div className="mp-day">UPCOMING</div>
      {subscriptions.map((s) => (
        <div className="sub-row" key={s.label}>
          <span className="muted">{s.date}</span>
          <span aria-hidden>{s.emoji}</span>
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

export function SpendingSection() {
  return (
    <section className="features" id="features">
      <Reveal>
        <h2 className="section-title">Track your spending,<br />boost your savings</h2>
      </Reveal>
      <div className="bento">
        <Card className="span-2 split" title="Know where your money goes" body="Our AI learns your spending patterns and tags every transaction automatically. The more you use it, the smarter it gets.">
          <ReviewList />
        </Card>
        <Card className="span-2" delay={80} title="Follow the line" body="Start your day with a quick look at your spending line, pending refunds, and upcoming bills.">
          <SpendingLine />
        </Card>
        <Card className="span-2 split" title="Rollovers" body="Didn't spend your full budget this month? Roll it over and save up for bigger purchases.">
          <Rollover />
        </Card>
        <Card delay={80} title="Cash flow" body="Income up, expenses down. Track trends with monthly summaries.">
          <CashFlow />
        </Card>
        <Card delay={160} title="Spot subscriptions" body="That streaming service you forgot about? We didn't.">
          <Subscriptions />
        </Card>
      </div>
    </section>
  )
}

function NetWorth() {
  const total = accounts.reduce((s, a) => s + a.balance, 0)
  return (
    <div className="networth">
      <div className="nw-head">
        <Change value={2.29} />
        <div className="nw-total"><Money value={total} digits={0} /></div>
        <small className="muted">total balance</small>
        <Sparkline seed={42} up width={360} height={90} />
      </div>
      <div className="nw-list">
        <div className="nw-list-head"><span>Accounts</span><span className="muted">3m balance change</span></div>
        {accounts.map((a) => (
          <div className="nw-row" key={a.name}>
            <span className="avatar" style={{ background: a.color }}>{a.initial}</span>
            <span className="nw-name">{a.name}<small className="muted">{a.updated}</small></span>
            <Change value={a.change} />
            <Money value={a.balance} digits={0} className="nw-bal" />
          </div>
        ))}
      </div>
    </div>
  )
}

function Holdings() {
  return (
    <div className="holdings">
      {holdings.map((h) => (
        <div className="holding" key={h.ticker}>
          <b>{h.ticker}</b>
          <small className="muted ellipsis">{h.name}</small>
          <Sparkline seed={h.seed} up={h.change >= 0} width={110} height={52} />
          <Change value={h.change} />
        </div>
      ))}
    </div>
  )
}

function Allocation() {
  const [ref, visible] = useReveal<HTMLDivElement>()
  return (
    <div className="alloc" ref={ref}>
      <div className="alloc-head"><b>Allocation</b><span className="muted">By percentage</span></div>
      {allocation.map((a) => (
        <div className="alloc-row" key={a.label}>
          <span>{a.label}</span>
          <div className="alloc-track"><i style={{ width: visible ? `${a.pct}%` : 0 }} /></div>
        </div>
      ))}
    </div>
  )
}

function RealEstate() {
  const [url, setUrl] = useState('')
  return (
    <div className="realestate">
      <div className="re-head"><span>←</span><small>REAL ESTATE ACCOUNT</small></div>
      <div className="re-icon" aria-hidden>⌂</div>
      <b>Start by entering a property URL</b>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="zillow.com/123-main-street-brooklyn" aria-label="Property URL" />
    </div>
  )
}

export function WealthSection() {
  return (
    <section className="wealth" id="wealth">
      <Reveal>
        <h2 className="section-title">Grow your wealth,<br />track your progress</h2>
      </Reveal>
      <div className="bento light">
        <Card className="span-2 tall" title="All your money, one screen" body="Stocks, crypto, your house. No need to jump between five different apps to see your net worth.">
          <NetWorth />
        </Card>
        <Card className="span-2" delay={80} title="Live performance" body="Live estimates. Check when you want to, not when you have to.">
          <Holdings />
        </Card>
        <Card title="Allocation" body="Too much crypto? Not enough bonds? See how diversified you are.">
          <Allocation />
        </Card>
        <Card delay={80} title="Real estate" body="Type in your address. We'll track what your place is worth.">
          <RealEstate />
        </Card>
      </div>
    </section>
  )
}
