import { addDays, addMonths, round2, today, type DB } from '../db.ts'
import { normalizeName } from './recurring.ts'

export type TimeFrame = 'ONE_WEEK' | 'ONE_MONTH' | 'THREE_MONTHS' | 'YTD' | 'ONE_YEAR' | 'ALL'

/** Dates to plot for a time frame, from oldest to today. Longer ranges use wider steps. */
export function timeFrameDates(tf: TimeFrame, earliest: string, end = today()): string[] {
  let start: string
  let step: number
  switch (tf) {
    case 'ONE_WEEK': start = addDays(end, -7); step = 1; break
    case 'ONE_MONTH': start = addMonths(end, -1); step = 1; break
    case 'THREE_MONTHS': start = addMonths(end, -3); step = 2; break
    case 'YTD': start = `${end.slice(0, 4)}-01-01`; step = 3; break
    case 'ONE_YEAR': start = addMonths(end, -12); step = 4; break
    case 'ALL': start = earliest; step = 7; break
  }
  if (start < earliest) start = earliest
  const out: string[] = []
  for (let d = start; d < end; d = addDays(d, step)) out.push(d)
  out.push(end)
  return out
}

/** Forward-fills a sorted (date, value) series onto the requested dates. */
function sampleSeries(series: { date: string; value: number }[], dates: string[]): number[] {
  let i = -1
  return dates.map((d) => {
    while (i + 1 < series.length && series[i + 1].date <= d) i++
    return i >= 0 ? series[i].value : series[0]?.value ?? 0
  })
}

const ASSET_TYPES = new Set(['depository', 'investment', 'real_estate', 'other'])

export function networthHistory(db: DB, tf: TimeFrame) {
  const accounts = db.prepare('SELECT id, type, balance FROM accounts WHERE is_hidden = 0 AND is_closed = 0').all() as {
    id: string; type: string; balance: number
  }[]
  const earliest = (db.prepare('SELECT MIN(date) AS d FROM balance_history').get() as { d: string | null }).d ?? today()
  const dates = timeFrameDates(tf, earliest)
  const assets = dates.map(() => 0)
  const debt = dates.map(() => 0)
  const q = db.prepare('SELECT date, balance AS value FROM balance_history WHERE account_id = ? ORDER BY date')
  for (const a of accounts) {
    const series = q.all(a.id) as { date: string; value: number }[]
    // The current balance is the truth for today.
    series.push({ date: today(), value: a.balance })
    const vals = sampleSeries(series, dates)
    const target = ASSET_TYPES.has(a.type) ? assets : debt
    vals.forEach((v, i) => (target[i] += v))
  }
  return dates.map((date, i) => ({ date, assets: round2(assets[i]), debt: round2(debt[i]), total: round2(assets[i] - debt[i]) }))
}

export function accountBalanceHistory(db: DB, accountId: string, tf: TimeFrame) {
  const acct = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(accountId) as { balance: number } | undefined
  if (!acct) return []
  const series = db.prepare('SELECT date, balance AS value FROM balance_history WHERE account_id = ? ORDER BY date').all(accountId) as {
    date: string; value: number
  }[]
  series.push({ date: today(), value: acct.balance })
  const dates = timeFrameDates(tf, series[0].date)
  return sampleSeries(series, dates).map((v, i) => ({ date: dates[i], balance: round2(v) }))
}

// ---------------- Investments ----------------

type HoldingRow = { id: string; account_id: string; security_id: string; quantity: number; cost_basis: number }

export function priceSeries(db: DB, securityId: string) {
  return db.prepare('SELECT date, price AS value FROM security_prices WHERE security_id = ? ORDER BY date').all(securityId) as {
    date: string; value: number
  }[]
}

export function currentPrice(db: DB, securityId: string): number {
  const r = db.prepare('SELECT price FROM security_prices WHERE security_id = ? ORDER BY date DESC LIMIT 1').get(securityId) as
    | { price: number }
    | undefined
  return r?.price ?? 0
}

/** Value of all holdings over time, assuming today's quantities (no trade history in this model). */
export function investmentBalance(db: DB, tf: TimeFrame, accountId?: string) {
  const holdings = db
    .prepare(`SELECT * FROM holdings ${accountId ? 'WHERE account_id = ?' : ''}`)
    .all(...(accountId ? [accountId] : [])) as HoldingRow[]
  const earliest = (db.prepare('SELECT MIN(date) AS d FROM security_prices').get() as { d: string | null }).d ?? today()
  const dates = timeFrameDates(tf, earliest)
  const totals = dates.map(() => 0)
  for (const h of holdings) {
    sampleSeries(priceSeries(db, h.security_id), dates).forEach((p, i) => (totals[i] += p * h.quantity))
  }
  return dates.map((date, i) => ({ date, balance: round2(totals[i]) }))
}

export function investmentPerformance(db: DB, tf: TimeFrame) {
  const bal = investmentBalance(db, tf)
  const base = bal[0]?.balance || 1
  return bal.map((b) => ({ date: b.date, performance: round2(((b.balance - base) / base) * 100) }))
}

export function holdingsWithMetrics(db: DB) {
  const rows = db
    .prepare('SELECT h.*, s.symbol, s.name, s.type FROM holdings h JOIN securities s ON s.id = h.security_id')
    .all() as (HoldingRow & { symbol: string; name: string; type: string })[]
  return rows.map((h) => {
    const price = currentPrice(db, h.security_id)
    const value = price * h.quantity
    return {
      ...h,
      price,
      value: round2(value),
      averageCost: round2(h.cost_basis / h.quantity),
      totalReturn: round2(value - h.cost_basis),
      totalReturnPct: round2(((value - h.cost_basis) / h.cost_basis) * 100),
    }
  })
}

export function allocation(db: DB) {
  const byType = new Map<string, number>()
  for (const h of holdingsWithMetrics(db)) byType.set(h.type, (byType.get(h.type) ?? 0) + h.value)
  const total = [...byType.values()].reduce((a, b) => a + b, 0) || 1
  return [...byType.entries()]
    .map(([type, amount]) => ({ id: type, type, amount: round2(amount), percentage: round2((amount / total) * 100) }))
    .sort((a, b) => b.amount - a.amount)
}

/** Day-over-day % change for each held security, largest moves first. */
export function topMovers(db: DB) {
  const secs = db.prepare('SELECT DISTINCT s.* FROM securities s JOIN holdings h ON h.security_id = s.id').all() as {
    id: string; symbol: string; name: string; type: string
  }[]
  return secs
    .map((s) => {
      const p = db.prepare('SELECT price FROM security_prices WHERE security_id = ? ORDER BY date DESC LIMIT 2').all(s.id) as { price: number }[]
      const change = p.length === 2 ? ((p[0].price - p[1].price) / p[1].price) * 100 : 0
      return { security: s, change: round2(change) }
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
}

// ---------------- Categorization ----------------

/** Categories this merchant was filed under before, most common first. */
export function suggestCategories(db: DB, name: string, excludeId?: string): string[] {
  const key = normalizeName(name)
  if (!key) return []
  const rows = db
    .prepare('SELECT name, category_id FROM transactions WHERE category_id IS NOT NULL AND id != ? ORDER BY date DESC LIMIT 5000')
    .all(excludeId ?? '') as { name: string; category_id: string }[]
  const counts = new Map<string, number>()
  for (const r of rows) if (normalizeName(r.name) === key) counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id)
}
