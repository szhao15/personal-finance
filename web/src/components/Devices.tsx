import { BRAND_SHORT, tags } from '../data'
import { Money, SpendingLine, TagChip } from './ui'

const sidebar = ['Dashboard', 'Transactions', 'Accounts', 'Investments', 'Categories', 'Recurrings']
const sideIcons = ['➤', '☰', '▤', '📈', '◔', '↻']

const desktopTx = {
  Today: [
    { m: 'Apple Music', a: 10.99, t: tags.subscriptions },
    { m: 'Park Slope Food Coop', a: 32.86, t: tags.groceries },
    { m: 'Lyft', a: 21.35, t: tags.transport },
  ],
  Yesterday: [
    { m: 'Film Noir Cinemas', a: 17.99, t: tags.entertainment },
    { m: "Eden's Salads", a: 15.12, t: tags.restaurants },
    { m: 'Target', a: 56.4, t: tags.shops },
  ],
}

const topCategories = [
  { e: '🍔', l: 'Food & Drink', a: 368, open: true },
  { e: '🥟', l: 'Restaurants', a: 84, sub: true },
  { e: '🥑', l: 'Groceries', a: 263, sub: true },
  { e: '☕️', l: 'Coffee', a: 21, sub: true },
  { e: '🏠', l: 'Necessities', a: 645 },
  { e: '🛍️', l: 'Shopping', a: 76 },
  { e: '🎉', l: 'Fun', a: 40 },
]

export function DesktopDashboard() {
  return (
    <div className="desktop" aria-label="Desktop dashboard preview">
      <div className="desktop-bar">
        <i /><i /><i />
      </div>
      <div className="desktop-body">
        <aside className="d-side">
          <div className="d-search">⌕ Search</div>
          {sidebar.map((s, i) => (
            <div key={s} className={`d-nav ${i === 0 ? 'active' : ''}`}>
              <span>{sideIcons[i]}</span>
              {s}
            </div>
          ))}
          <div className="d-group">▾ Credit cards</div>
          <div className="d-acct"><span className="dot blue" />American Express<b>$832</b></div>
          <div className="d-acct"><span className="dot teal" />Cash Rewards<b>$1,594</b></div>
          <div className="d-group">▸ Depository</div>
          <div className="d-group">▸ Investment</div>
        </aside>
        <main className="d-main">
          <div className="d-title">Dashboard</div>
          <div className="d-grid">
            <section className="d-card">
              <header>Monthly spending <span>Transactions ›</span></header>
              <div className="d-big"><Money value={1000} digits={0} /> spent</div>
              <div className="d-sub">$500 spent last month</div>
              <SpendingLine label="$100 under" compact />
            </section>
            <section className="d-card">
              <header>Net worth</header>
              <div className="d-big"><Money value={100000} digits={0} /></div>
              <div className="d-pill">↗ 32%</div>
              <div className="nw-lines"><i /><i /></div>
            </section>
            <section className="d-card">
              <header>Transactions to review <span>View all ›</span></header>
              {Object.entries(desktopTx).map(([day, list]) => (
                <div key={day}>
                  <div className="d-day">{day.toUpperCase()}</div>
                  {list.map((t) => (
                    <div className="d-row" key={t.m}>
                      <span className="d-m">{t.m}</span>
                      <TagChip tag={t.t} />
                      <span className="d-a">${t.a.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div className="d-mark">✓ Mark 6 as reviewed</div>
            </section>
            <section className="d-card">
              <header>Top categories</header>
              {topCategories.map((c) => (
                <div className={`d-cat ${c.sub ? 'sub' : ''}`} key={c.l}>
                  <span>{c.sub ? '' : c.open ? '▾' : '▸'}</span>
                  <span>{c.e}</span>
                  <span className="d-m">{c.l}</span>
                  <span className="d-a">${c.a}</span>
                </div>
              ))}
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}

const budgets = [
  { e: '🚙', v: 206, s: 'over', c: '#f04242', p: 1 },
  { e: '🎟️', v: 15.51, s: 'over', c: '#f04242', p: 1 },
  { e: '🥑', v: 63.25, s: 'left', c: '#fece4c', p: 0.7 },
  { e: '🚌', v: 41.89, s: 'left', c: '#ff8833', p: 0.55 },
  { e: '🍔', v: 183, s: 'left', c: '#40bf40', p: 0.35 },
]

export function PhoneApp({ demo = false }: { demo?: boolean }) {
  return (
    <div className="phone" aria-label="Phone app preview">
      <div className="phone-notch" />
      <div className="phone-status">
        <span>9:11</span>
        <span>▮▮▮ ◠ ▭</span>
      </div>
      {demo && <div className="phone-demo">You're in demo mode <span>✕</span></div>}
      <div className="phone-head">
        <span className="ph-icon">◉</span>
        <b>{BRAND_SHORT}</b>
        <span className="ph-icon">▢</span>
      </div>
      <div className="phone-tabs">
        <span>Investments</span>
        <span className="on">Dashboard</span>
        <span>Transactions</span>
      </div>
      <div className="phone-card">
        <div className="ph-big"><Money value={2272} digits={0} /> left</div>
        <div className="ph-sub">out of $5,400 budgeted</div>
        <SpendingLine label="$268 under" compact />
      </div>
      <div className="ph-section">TO REVIEW <span>View all ›</span></div>
      <div className="phone-card list">
        <div className="ph-day">So far today</div>
        <div className="d-row"><span className="d-m">Impasto</span><TagChip tag={tags.restaurants} /><span className="d-a">$17.55</span></div>
        <div className="d-row"><span className="d-m">Velvette Brew</span><TagChip tag={tags.groceries} /><span className="d-a">$15.51</span></div>
        <div className="ph-mark">MARK AS REVIEWED</div>
      </div>
      <div className="ph-section">BUDGETS <span>Categories ›</span></div>
      <div className="ph-budgets">
        {budgets.map((b, i) => (
          <div key={i} className="ph-ring">
            <svg viewBox="0 0 40 40" aria-hidden>
              <circle cx="20" cy="20" r="16" className="ring-bg" />
              <circle cx="20" cy="20" r="16" stroke={b.c} className="ring-fg" strokeDasharray={`${b.p * 100.5} 100.5`} />
            </svg>
            <span className="ring-emoji">{b.e}</span>
            <small>${b.v}</small>
            <small className="muted">{b.s}</small>
          </div>
        ))}
      </div>
    </div>
  )
}
