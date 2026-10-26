import { addMonth, daysInMonth, monthOf, round2, today, type DB } from '../db.ts'

export type CategoryRow = {
  id: string
  name: string
  emoji: string
  color: string
  parent_id: string | null
  is_excluded: number
  rollover_enabled: number
  sort: number
}

/**
 * Spend per category for a date range. Counts regular transactions (not income or transfers),
 * skips split parents (their children carry the amounts) and excluded categories.
 * Refunds (negative amounts) reduce spend.
 */
export function spendByCategory(db: DB, from: string, to: string): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT t.category_id AS id, SUM(t.amount) AS total
       FROM transactions t JOIN categories c ON c.id = t.category_id
       WHERE t.date BETWEEN ? AND ? AND t.type = 'regular' AND t.is_split_parent = 0 AND c.is_excluded = 0
       GROUP BY t.category_id`,
    )
    .all(from, to) as { id: string; total: number }[]
  return new Map(rows.map((r) => [r.id, r.total]))
}

export const monthRange = (month: string) => [`${month}-01`, `${month}-${String(daysInMonth(month)).padStart(2, '0')}`] as const

/** Spend for a month, plus the comparison: last month up to the same day (or all of it, for past months). */
export function monthSpend(db: DB, month: string) {
  const [from, to] = monthRange(month)
  const current = spendByCategory(db, from, to)
  const prev = addMonth(month, -1)
  const [pFrom, pTo] = monthRange(prev)
  const isCurrent = month === monthOf(today())
  const dayCut = Math.min(Number(today().slice(8)), daysInMonth(prev))
  const comparison = spendByCategory(db, pFrom, isCurrent ? `${prev}-${String(dayCut).padStart(2, '0')}` : pTo)
  return { current, comparison }
}

/** Budget set for a category in a month: the latest row at or before that month. */
export function budgetAmount(db: DB, categoryId: string, month: string): number {
  const row = db
    .prepare('SELECT amount FROM budgets WHERE category_id = ? AND month <= ? ORDER BY month DESC LIMIT 1')
    .get(categoryId, month) as { amount: number } | undefined
  return row?.amount ?? 0
}

/**
 * Rollover into `month`: unspent (or overspent) budget carried forward month by month,
 * starting from the first month the category had a budget. Only when rollovers are enabled.
 */
export function rolloverAmount(db: DB, cat: CategoryRow, month: string): number {
  if (!cat.rollover_enabled) return 0
  const first = db.prepare('SELECT MIN(month) AS m FROM budgets WHERE category_id = ?').get(cat.id) as { m: string | null }
  if (!first.m || first.m >= month) return 0
  // Cap the walk so a very old first budget doesn't make this slow.
  let m = first.m < addMonth(month, -24) ? addMonth(month, -24) : first.m
  let carry = 0
  while (m < month) {
    const [from, to] = monthRange(m)
    const spent = spendByCategory(db, from, to).get(cat.id) ?? 0
    carry = budgetAmount(db, cat.id, m) + carry - spent
    m = addMonth(m, 1)
  }
  return round2(carry)
}

export type MonthlyBudget = {
  id: string
  month: string
  amount: number
  rolloverAmount: number
  childAmount: number
  childRolloverAmount: number
  resolvedAmount: number
}

/**
 * Budget for one category in a month. A parent's total is its own (unassigned) amount
 * plus everything budgeted in its children.
 */
export function monthlyBudget(db: DB, cat: CategoryRow, children: CategoryRow[], month: string): MonthlyBudget {
  const amount = budgetAmount(db, cat.id, month)
  const rollover = rolloverAmount(db, cat, month)
  let childAmount = 0
  let childRollover = 0
  for (const c of children) {
    childAmount += budgetAmount(db, c.id, month)
    childRollover += rolloverAmount(db, c, month)
  }
  return {
    id: `${cat.id}:${month}`,
    month,
    amount: round2(amount),
    rolloverAmount: round2(rollover),
    childAmount: round2(childAmount),
    childRolloverAmount: round2(childRollover),
    resolvedAmount: round2(amount + rollover + childAmount + childRollover),
  }
}

/** Sets a budget from `month` onward. Later explicit months keep their own values. */
export function setBudget(db: DB, categoryId: string, month: string, amount: number) {
  db.prepare(
    'INSERT INTO budgets (category_id, month, amount) VALUES (?, ?, ?) ON CONFLICT(category_id, month) DO UPDATE SET amount = excluded.amount',
  ).run(categoryId, month, amount)
}
