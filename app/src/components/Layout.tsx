import { useState } from 'react'
import { NavLink, Outlet, useSearchParams } from 'react-router'
import { useGql } from '../lib/api'
import { ACCOUNT_FIELDS } from '../lib/fragments'
import { ACCOUNT_TYPE_LABELS, money } from '../lib/format'
import type { Account } from '../lib/types'
import { TransactionDrawer } from './transactions'

const NAV = [
  ['/dashboard', 'Dashboard', '◧'],
  ['/transactions', 'Transactions', '☰'],
  ['/accounts', 'Accounts', '▤'],
  ['/investments', 'Investments', '↗'],
  ['/categories', 'Categories', '◔'],
  ['/recurrings', 'Recurrings', '↻'],
] as const

/** Opens the transaction panel from anywhere by setting ?tx=<id> in the URL. */
export function useOpenTransaction() {
  const [params, setParams] = useSearchParams()
  return (id: string) => {
    const next = new URLSearchParams(params)
    next.set('tx', id)
    setParams(next)
  }
}

export default function Layout() {
  const [params, setParams] = useSearchParams()
  const txId = params.get('tx')
  const [menuOpen, setMenuOpen] = useState(false)
  const { data } = useGql<{ accounts: Account[] }>(`query SidebarAccounts { accounts { ${ACCOUNT_FIELDS} } }`)
  const groups = new Map<string, Account[]>()
  for (const a of data?.accounts ?? []) if (!a.isClosed) groups.set(a.type, [...(groups.get(a.type) ?? []), a])

  const closeTx = () => {
    const next = new URLSearchParams(params)
    next.delete('tx')
    setParams(next)
  }

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 32 32" width="16" height="16"><path d="M26 6 5 14.5l9 2.6 2.6 9z" fill="currentColor" /></svg>
          </span>
          <b>Money</b>
          <button className="icon-btn menu-btn" aria-label="Menu" onClick={() => setMenuOpen((o) => !o)}>☰</button>
        </div>
        <nav className="nav" onClick={() => setMenuOpen(false)}>
          {NAV.map(([to, label, icon]) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon" aria-hidden>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="side-accounts">
          {[...groups.entries()].map(([type, list]) => (
            <div key={type} className="side-group">
              <div className="side-group-label">{ACCOUNT_TYPE_LABELS[type] ?? type}</div>
              {list.map((a) => (
                <NavLink key={a.id} to={`/accounts/${a.id}`} className="side-acct" onClick={() => setMenuOpen(false)}>
                  <span className="dot" style={{ background: a.color }} />
                  <span className="ellipsis">{a.name}</span>
                  <b>{money(a.balance, true)}</b>
                </NavLink>
              ))}
            </div>
          ))}
        </div>
        <NavLink to="/settings" className={({ isActive }) => `nav-item settings ${isActive ? 'active' : ''}`}>
          <span className="nav-icon" aria-hidden>⚙</span> Settings
        </NavLink>
      </aside>
      <main className="main">
        <Outlet />
      </main>
      {txId && <TransactionDrawer id={txId} onClose={closeTx} />}
    </div>
  )
}
