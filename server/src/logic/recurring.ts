import { addDays, addMonths, daysBetween, newId, round2, today, type DB } from '../db.ts'

export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semiannually' | 'yearly'

export type RecurringRow = {
  id: string
  name: string
  emoji: string
  category_id: string | null
  frequency: Frequency
  state: 'active' | 'paused' | 'archived'
  rule_name_contains: string
  rule_min_amount: number | null
  rule_max_amount: number | null
}

type TxLite = { id: string; date: string; name: string; amount: number }

export function nextDate(date: string, f: Frequency): string {
  switch (f) {
    case 'weekly': return addDays(date, 7)
    case 'biweekly': return addDays(date, 14)
    case 'monthly': return addMonths(date, 1)
    case 'quarterly': return addMonths(date, 3)
    case 'semiannually': return addMonths(date, 6)
    case 'yearly': return addMonths(date, 12)
  }
}

/** Typical gap in days and how far off a payment can be and still count. */
const PERIODS: { f: Frequency; days: number; tol: number }[] = [
  { f: 'weekly', days: 7, tol: 2 },
  { f: 'biweekly', days: 14, tol: 3 },
  { f: 'monthly', days: 30.4, tol: 4 },
  { f: 'quarterly', days: 91, tol: 10 },
  { f: 'semiannually', days: 182, tol: 15 },
  { f: 'yearly', days: 365, tol: 20 },
]

/** Merchant names vary ("NETFLIX.COM #1234"), so compare a simplified form. */
export const normalizeName = (name: string) =>
  name.toLowerCase().replace(/[#*].*$/, '').replace(/\d{3,}/g, '').replace(/[^a-z&' ]/g, ' ').replace(/\s+/g, ' ').trim()

export function matchesRule(r: Pick<RecurringRow, 'rule_name_contains' | 'rule_min_amount' | 'rule_max_amount'>, t: { name: string; amount: number }) {
  if (!t.name.toLowerCase().includes(r.rule_name_contains.toLowerCase())) return false
  if (r.rule_min_amount != null && t.amount < r.rule_min_amount) return false
  if (r.rule_max_amount != null && t.amount > r.rule_max_amount) return false
  return true
}

/** Links unassigned transactions to the first active recurring whose rule matches. Returns how many were linked. */
export function assignRecurrings(db: DB, onlyRecurringId?: string): number {
  const recs = db
    .prepare(`SELECT * FROM recurrings WHERE state != 'archived' ${onlyRecurringId ? 'AND id = ?' : ''}`)
    .all(...(onlyRecurringId ? [onlyRecurringId] : [])) as RecurringRow[]
  const txs = db
    .prepare("SELECT id, name, amount, date FROM transactions WHERE recurring_id IS NULL AND is_split_parent = 0 AND type != 'internal_transfer'")
    .all() as TxLite[]
  const upd = db.prepare('UPDATE transactions SET recurring_id = ? WHERE id = ?')
  let n = 0
  for (const t of txs) {
    const r = recs.find((r) => matchesRule(r, t))
    if (r) {
      upd.run(r.id, t.id)
      n++
    }
  }
  return n
}

export function recurringTransactions(db: DB, id: string): TxLite[] {
  return db.prepare('SELECT id, name, amount, date FROM transactions WHERE recurring_id = ? ORDER BY date').all(id) as TxLite[]
}

/**
 * Next expected payment: step forward from the last payment until we reach a date that's
 * no more than a few days in the past (a slightly late charge still shows as due).
 */
export function nextPayment(db: DB, r: RecurringRow, asOf = today()) {
  const txs = recurringTransactions(db, r.id)
  if (r.state !== 'active' || txs.length === 0) return { date: null, amount: txs.at(-1)?.amount ?? null }
  const last = txs[txs.length - 1]
  let d = nextDate(last.date, r.frequency)
  while (d < addDays(asOf, -3)) d = nextDate(d, r.frequency)
  return { date: d, amount: round2(last.amount) }
}

/** Paid payments in range from matched transactions, plus expected unpaid ones. */
export function payments(db: DB, r: RecurringRow, from: string, to: string) {
  const out = recurringTransactions(db, r.id)
    .filter((t) => t.date >= from && t.date <= to)
    .map((t) => ({ date: t.date, amount: t.amount, isPaid: true }))
  const next = nextPayment(db, r)
  if (next.date) {
    let d = next.date
    while (d <= to) {
      if (d >= from) out.push({ date: d, amount: next.amount ?? 0, isPaid: false })
      d = nextDate(d, r.frequency)
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/** Guesses a frequency from payment dates. Needs 3+ payments with mostly regular gaps. */
export function detectFrequency(dates: string[]): Frequency | null {
  if (dates.length < 3) return null
  const sorted = [...dates].sort()
  const gaps = sorted.slice(1).map((d, i) => daysBetween(sorted[i], d))
  const m = median(gaps)
  const p = PERIODS.find((p) => Math.abs(m - p.days) <= p.tol)
  if (!p) return null
  const regular = gaps.filter((g) => Math.abs(g - p.days) <= p.tol).length
  return regular / gaps.length >= 0.7 ? p.f : null
}

export type Suggestion = {
  name: string
  frequency: Frequency
  categoryId: string | null
  ruleNameContains: string
  minAmount: number | null
  maxAmount: number | null
  transactionIds: string[]
}

/**
 * Finds charges that repeat on a schedule but aren't tracked yet: grouped by merchant,
 * regular gaps, still active, and (when amounts are steady) an amount range rule.
 */
export function suggestRecurrings(db: DB, asOf = today()): Suggestion[] {
  const txs = db
    .prepare(
      `SELECT id, name, amount, date, category_id FROM transactions
       WHERE recurring_id IS NULL AND is_split_parent = 0 AND type = 'regular' AND amount > 0 AND date >= ?`,
    )
    .all(addDays(asOf, -400)) as (TxLite & { category_id: string | null })[]
  const groups = new Map<string, typeof txs>()
  for (const t of txs) {
    const k = normalizeName(t.name)
    if (k.length < 3) continue
    groups.set(k, [...(groups.get(k) ?? []), t])
  }
  const out: Suggestion[] = []
  for (const [key, list] of groups) {
    const f = detectFrequency(list.map((t) => t.date))
    if (!f) continue
    const last = list.map((t) => t.date).sort().at(-1)!
    // Skip ones that seem to have stopped (no charge in over two periods).
    if (nextDate(nextDate(last, f), f) < asOf) continue
    const amounts = list.map((t) => t.amount)
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length
    const spread = Math.sqrt(amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / amounts.length) / mean
    const steady = spread < 0.25
    const cats = list.map((t) => t.category_id).filter(Boolean) as string[]
    // Use the merchant's own spelling from the latest charge, minus store numbers.
    const latest = [...list].sort((a, b) => b.date.localeCompare(a.date))[0]
    const display = latest.name.replace(/\s*[#*].*$/, '').replace(/\s+\d{3,}.*$/, '').trim()
    out.push({
      name: display || titleCase(key),
      frequency: f,
      categoryId: cats.length ? mode(cats) : null,
      ruleNameContains: key,
      minAmount: steady ? round2(Math.min(...amounts) * 0.8) : null,
      maxAmount: steady ? round2(Math.max(...amounts) * 1.2) : null,
      transactionIds: list.map((t) => t.id),
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function createRecurring(
  db: DB,
  input: { name: string; emoji?: string; categoryId?: string | null; frequency: Frequency; ruleNameContains: string; minAmount?: number | null; maxAmount?: number | null },
) {
  const id = newId('rec')
  db.prepare(
    `INSERT INTO recurrings (id, name, emoji, category_id, frequency, rule_name_contains, rule_min_amount, rule_max_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.name, input.emoji ?? '🔁', input.categoryId ?? null, input.frequency, input.ruleNameContains, input.minAmount ?? null, input.maxAmount ?? null)
  assignRecurrings(db, id)
  return id
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())
const mode = <T,>(xs: T[]) => {
  const c = new Map<T, number>()
  xs.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1))
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0]
}
