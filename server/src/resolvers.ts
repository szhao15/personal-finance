import { GraphQLError } from 'graphql'
import { addDays, addMonth, addMonths, daysInMonth, monthOf, newId, round2, today, tx, type DB } from './db.ts'
import { monthlyBudget, monthRange, monthSpend, setBudget, spendByCategory, type CategoryRow } from './logic/budget.ts'
import {
  accountBalanceHistory, allocation, currentPrice, holdingsWithMetrics, investmentBalance, investmentPerformance,
  networthHistory, priceSeries, suggestCategories, timeFrameDates, topMovers, type TimeFrame,
} from './logic/history.ts'
import {
  assignRecurrings, createRecurring, detectFrequency, nextPayment, normalizeName, payments, recurringTransactions,
  suggestRecurrings, type Frequency, type RecurringRow,
} from './logic/recurring.ts'

export type Ctx = { db: DB; cache: Map<string, unknown> }

type AccountRow = {
  id: string; name: string; type: string; sub_type: string | null; institution: string | null; mask: string | null; color: string
  balance: number; credit_limit: number | null; is_manual: number; is_hidden: number; is_closed: number; updated_at: string
}
type TxRow = {
  id: string; account_id: string; date: string; name: string; amount: number; type: string; category_id: string | null
  recurring_id: string | null; parent_id: string | null; is_split_parent: number; is_reviewed: number; is_pending: number
  notes: string | null; created_at: string
}

const bad = (msg: string) => new GraphQLError(msg, { extensions: { code: 'BAD_USER_INPUT' } })
const must = <T,>(v: T | undefined, what: string): T => {
  if (v === undefined || v === null) throw new GraphQLError(`${what} not found`, { extensions: { code: 'NOT_FOUND' } })
  return v
}
const cached = <T,>(ctx: Ctx, key: string, fn: () => T): T => {
  if (!ctx.cache.has(key)) ctx.cache.set(key, fn())
  return ctx.cache.get(key) as T
}
const thisMonth = () => monthOf(today())

// ---------- loaders ----------
const getAccount = (db: DB, id: string) => db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined
const getCategory = (db: DB, id: string) => db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as CategoryRow | undefined
const getTx = (db: DB, id: string) => db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as TxRow | undefined
const getRecurring = (db: DB, id: string) => db.prepare('SELECT * FROM recurrings WHERE id = ?').get(id) as RecurringRow | undefined
const childrenOf = (ctx: Ctx, id: string) =>
  cached(ctx, `children:${id}`, () => ctx.db.prepare('SELECT * FROM categories WHERE parent_id = ? ORDER BY sort, name').all(id) as CategoryRow[])

/** Spend for every category in a month, cached per request. */
const spendFor = (ctx: Ctx, month: string) => cached(ctx, `spend:${month}`, () => monthSpend(ctx.db, month))

/** Recurring payments in a month, totalled per category. */
const recurringByCategory = (ctx: Ctx, month: string) =>
  cached(ctx, `recpay:${month}`, () => {
    const [from, to] = monthRange(month)
    const out = new Map<string, { paid: number; unpaid: number }>()
    const recs = ctx.db.prepare("SELECT * FROM recurrings WHERE state = 'active' AND category_id IS NOT NULL").all() as RecurringRow[]
    for (const r of recs) {
      const e = out.get(r.category_id!) ?? { paid: 0, unpaid: 0 }
      for (const p of payments(ctx.db, r, from, to)) p.isPaid ? (e.paid += p.amount) : (e.unpaid += p.amount)
      out.set(r.category_id!, e)
    }
    return out
  })

function categorySpend(ctx: Ctx, cat: CategoryRow, month: string) {
  const ids = [cat.id, ...childrenOf(ctx, cat.id).map((c) => c.id)]
  const { current, comparison } = spendFor(ctx, month)
  const rec = recurringByCategory(ctx, month)
  const sum = (m: Map<string, number>) => ids.reduce((s, id) => s + (m.get(id) ?? 0), 0)
  return {
    id: `${cat.id}:${month}`,
    month,
    amount: round2(sum(current)),
    comparisonAmount: round2(sum(comparison)),
    paidRecurringAmount: round2(ids.reduce((s, id) => s + (rec.get(id)?.paid ?? 0), 0)),
    unpaidRecurringAmount: round2(ids.reduce((s, id) => s + (rec.get(id)?.unpaid ?? 0), 0)),
  }
}

function keyMetrics(db: DB, categoryIds: string[] | null) {
  const year = Number(today().slice(0, 4))
  const spend = spendByCategory(db, `${year}-01-01`, today())
  const total = categoryIds ? categoryIds.reduce((s, id) => s + (spend.get(id) ?? 0), 0) : [...spend.values()].reduce((a, b) => a + b, 0)
  const months = Number(today().slice(5, 7))
  return { year, totalSpent: round2(total), averageMonthlySpent: round2(total / months) }
}

const topLevel = (db: DB) => db.prepare('SELECT * FROM categories WHERE parent_id IS NULL ORDER BY sort, name').all() as CategoryRow[]

// ---------- transaction queries ----------
type Filter = {
  search?: string; categoryIds?: string[]; accountIds?: string[]; tagIds?: string[]; recurringId?: string; types?: string[]
  isReviewed?: boolean; from?: string; to?: string; minAmount?: number; maxAmount?: number
}
function buildWhere(db: DB, f: Filter = {}) {
  const where = ['t.parent_id IS NULL']
  const params: (string | number)[] = []
  const inList = (col: string, vals: string[]) => {
    where.push(`${col} IN (${vals.map(() => '?').join(',')})`)
    params.push(...vals)
  }
  if (f.search) {
    where.push('(t.name LIKE ? OR t.notes LIKE ?)')
    params.push(`%${f.search}%`, `%${f.search}%`)
  }
  if (f.categoryIds?.length) {
    // Picking a parent category includes its children; split parents match on their parts.
    const ids = new Set(f.categoryIds)
    for (const id of f.categoryIds) {
      for (const c of db.prepare('SELECT id FROM categories WHERE parent_id = ?').all(id) as { id: string }[]) ids.add(c.id)
    }
    const ph = [...ids].map(() => '?').join(',')
    where.push(`(t.category_id IN (${ph}) OR EXISTS (SELECT 1 FROM transactions s WHERE s.parent_id = t.id AND s.category_id IN (${ph})))`)
    params.push(...ids, ...ids)
  }
  if (f.accountIds?.length) inList('t.account_id', f.accountIds)
  if (f.types?.length) inList('t.type', f.types)
  if (f.tagIds?.length) {
    where.push(`EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = t.id AND tt.tag_id IN (${f.tagIds.map(() => '?').join(',')}))`)
    params.push(...f.tagIds)
  }
  if (f.recurringId) { where.push('t.recurring_id = ?'); params.push(f.recurringId) }
  if (f.isReviewed != null) { where.push('t.is_reviewed = ?'); params.push(f.isReviewed ? 1 : 0) }
  if (f.from) { where.push('t.date >= ?'); params.push(f.from) }
  if (f.to) { where.push('t.date <= ?'); params.push(f.to) }
  if (f.minAmount != null) { where.push('t.amount >= ?'); params.push(f.minAmount) }
  if (f.maxAmount != null) { where.push('t.amount <= ?'); params.push(f.maxAmount) }
  return { sql: where.join(' AND '), params }
}
const SORT_COLS: Record<string, string> = { DATE: 't.date', AMOUNT: 't.amount', NAME: 't.name COLLATE NOCASE' }
function orderBy(sort?: { field: string; direction: string }[]) {
  const parts = (sort?.length ? sort : [{ field: 'DATE', direction: 'DESC' }]).map((s) => `${SORT_COLS[s.field]} ${s.direction === 'ASC' ? 'ASC' : 'DESC'}`)
  return [...parts, 't.created_at DESC', 't.id'].join(', ')
}
const encodeCursor = (n: number) => Buffer.from(`o:${n}`).toString('base64url')
const decodeCursor = (c?: string | null) => (c ? Number(Buffer.from(c, 'base64url').toString().slice(2)) || 0 : 0)

function setTags(db: DB, txId: string, tagIds: string[]) {
  db.prepare('DELETE FROM transaction_tags WHERE transaction_id = ?').run(txId)
  const ins = db.prepare('INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)')
  tagIds.forEach((t) => ins.run(txId, t))
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// ---------- resolvers ----------
export const resolvers = {
  Query: {
    transactions: (_: unknown, a: { first: number; after?: string; filter?: Filter; sort?: { field: string; direction: string }[] }, { db }: Ctx) => {
      const first = Math.min(Math.max(a.first ?? 50, 1), 500)
      const offset = decodeCursor(a.after)
      const { sql, params } = buildWhere(db, a.filter)
      const total = (db.prepare(`SELECT COUNT(*) AS n FROM transactions t WHERE ${sql}`).get(...params) as { n: number }).n
      const rows = db.prepare(`SELECT t.* FROM transactions t WHERE ${sql} ORDER BY ${orderBy(a.sort)} LIMIT ? OFFSET ?`).all(...params, first, offset) as TxRow[]
      return {
        totalCount: total,
        edges: rows.map((node, i) => ({ node, cursor: encodeCursor(offset + i + 1) })),
        pageInfo: { endCursor: rows.length ? encodeCursor(offset + rows.length) : null, hasNextPage: offset + rows.length < total },
      }
    },
    transaction: (_: unknown, { id }: { id: string }, { db }: Ctx) => getTx(db, id) ?? null,
    exportTransactions: (_: unknown, { filter }: { filter?: Filter }, { db }: Ctx) => {
      const { sql, params } = buildWhere(db, filter)
      const rows = db
        .prepare(
          `SELECT t.date, t.name, t.amount, t.type, c.name AS category, a.name AS account, t.notes,
             (SELECT GROUP_CONCAT(g.name, '; ') FROM transaction_tags tt JOIN tags g ON g.id = tt.tag_id WHERE tt.transaction_id = t.id) AS tags
           FROM transactions t LEFT JOIN categories c ON c.id = t.category_id JOIN accounts a ON a.id = t.account_id
           WHERE ${sql} ORDER BY t.date DESC`,
        )
        .all(...params) as Record<string, unknown>[]
      const cols = ['date', 'name', 'amount', 'type', 'category', 'account', 'tags', 'notes']
      return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n')
    },

    categories: (_: unknown, __: unknown, { db }: Ctx) => topLevel(db),
    allCategories: (_: unknown, __: unknown, { db }: Ctx) => db.prepare('SELECT * FROM categories ORDER BY sort, name').all(),
    category: (_: unknown, { id }: { id: string }, { db }: Ctx) => getCategory(db, id) ?? null,
    categoriesTotal: () => ({}),
    spendingLine: (_: unknown, { month }: { month?: string }, ctx: Ctx) => {
      const m = month ?? thisMonth()
      const prev = addMonth(m, -1)
      const daily = (mm: string) => {
        const [from, to] = monthRange(mm)
        const rows = ctx.db
          .prepare(
            `SELECT t.date, SUM(t.amount) AS total FROM transactions t JOIN categories c ON c.id = t.category_id
             WHERE t.date BETWEEN ? AND ? AND t.type = 'regular' AND t.is_split_parent = 0 AND c.is_excluded = 0 GROUP BY t.date`,
          )
          .all(from, to) as { date: string; total: number }[]
        return new Map(rows.map((r) => [Number(r.date.slice(8)), r.total]))
      }
      const cur = daily(m)
      const pre = daily(prev)
      const lastDay = m === thisMonth() ? Number(today().slice(8)) : daysInMonth(m)
      const days = []
      let c = 0
      let p = 0
      for (let d = 1; d <= Math.max(daysInMonth(m), daysInMonth(prev)); d++) {
        c += cur.get(d) ?? 0
        p += pre.get(d) ?? 0
        days.push({ day: d, current: d <= lastDay ? round2(c) : null, previous: round2(p) })
      }
      const budget = topLevel(ctx.db).filter((c) => !c.is_excluded)
        .reduce((s, cat) => s + monthlyBudget(ctx.db, cat, childrenOf(ctx, cat.id), m).resolvedAmount, 0)
      return { month: m, budget: round2(budget), days }
    },

    tags: (_: unknown, __: unknown, { db }: Ctx) => db.prepare('SELECT * FROM tags ORDER BY name').all(),

    recurrings: (_: unknown, { state }: { state?: string }, { db }: Ctx) =>
      db.prepare(`SELECT * FROM recurrings ${state ? 'WHERE state = ?' : ''} ORDER BY name`).all(...(state ? [state] : [])),
    recurring: (_: unknown, { id }: { id: string }, { db }: Ctx) => getRecurring(db, id) ?? null,
    upcomingRecurrings: (_: unknown, { days }: { days: number }, { db }: Ctx) => {
      const until = addDays(today(), days)
      const recs = db.prepare("SELECT * FROM recurrings WHERE state = 'active'").all() as RecurringRow[]
      return recs
        .map((r) => ({ r, n: nextPayment(db, r) }))
        .filter(({ n }) => n.date && n.date <= until && (n.amount ?? 0) > 0)
        .map(({ r, n }) => ({ recurring: r, date: n.date, amount: n.amount }))
        .sort((a, b) => a.date!.localeCompare(b.date!))
    },
    suggestedRecurrings: (_: unknown, __: unknown, { db }: Ctx) =>
      suggestRecurrings(db).map((s) => {
        const txs = s.transactionIds.map((id) => getTx(db, id)!)
        return {
          ...s,
          category: s.categoryId ? getCategory(db, s.categoryId) : null,
          transactionCount: txs.length,
          averageAmount: round2(txs.reduce((a, t) => a + t.amount, 0) / txs.length),
          lastDate: txs.map((t) => t.date).sort().at(-1),
        }
      }),
    suggestedRecurringFrequency: (_: unknown, { name }: { name: string }, { db }: Ctx) => {
      const key = normalizeName(name)
      const dates = (db.prepare('SELECT name, date FROM transactions').all() as { name: string; date: string }[])
        .filter((t) => normalizeName(t.name) === key)
        .map((t) => t.date)
      return detectFrequency(dates)
    },

    accounts: (_: unknown, { includeHidden }: { includeHidden: boolean }, { db }: Ctx) =>
      db.prepare(`SELECT * FROM accounts ${includeHidden ? '' : 'WHERE is_hidden = 0'} ORDER BY type, name`).all(),
    account: (_: unknown, { id }: { id: string }, { db }: Ctx) => getAccount(db, id) ?? null,
    networthHistory: (_: unknown, { timeFrame }: { timeFrame: TimeFrame }, { db }: Ctx) => networthHistory(db, timeFrame),

    holdings: (_: unknown, { accountId }: { accountId?: string }, { db }: Ctx) =>
      holdingsWithMetrics(db).filter((h) => !accountId || h.account_id === accountId).sort((a, b) => b.value - a.value),
    investmentBalance: (_: unknown, { timeFrame, accountId }: { timeFrame: TimeFrame; accountId?: string }, { db }: Ctx) =>
      investmentBalance(db, timeFrame, accountId),
    investmentPerformance: (_: unknown, { timeFrame }: { timeFrame: TimeFrame }, { db }: Ctx) => investmentPerformance(db, timeFrame),
    investmentAllocation: (_: unknown, __: unknown, { db }: Ctx) => allocation(db),
    topMovers: (_: unknown, __: unknown, { db }: Ctx) => topMovers(db),
    security: (_: unknown, { id }: { id: string }, { db }: Ctx) => db.prepare('SELECT * FROM securities WHERE id = ?').get(id) ?? null,
  },

  Account: {
    subType: (a: AccountRow) => a.sub_type,
    limit: (a: AccountRow) => a.credit_limit,
    isManual: (a: AccountRow) => !!a.is_manual,
    isHidden: (a: AccountRow) => !!a.is_hidden,
    isClosed: (a: AccountRow) => !!a.is_closed,
    isDebt: (a: AccountRow) => a.type === 'credit' || a.type === 'loan',
    updatedAt: (a: AccountRow) => a.updated_at,
    balanceHistory: (a: AccountRow, { timeFrame }: { timeFrame: TimeFrame }, { db }: Ctx) => accountBalanceHistory(db, a.id, timeFrame),
    change3m: (a: AccountRow, _: unknown, { db }: Ctx) => {
      const h = accountBalanceHistory(db, a.id, 'THREE_MONTHS')
      const first = h[0]?.balance
      return first ? round2(((a.balance - first) / first) * 100) : null
    },
  },

  Category: {
    parentId: (c: CategoryRow) => c.parent_id,
    isExcluded: (c: CategoryRow) => !!c.is_excluded,
    rolloverEnabled: (c: CategoryRow) => !!c.rollover_enabled,
    canBeDeleted: (c: CategoryRow) => !['cat_income', 'cat_transfers'].includes(c.id),
    childCategories: (c: CategoryRow, _: unknown, ctx: Ctx) => childrenOf(ctx, c.id),
    spend: (c: CategoryRow, { month }: { month?: string }, ctx: Ctx) => categorySpend(ctx, c, month ?? thisMonth()),
    spendHistory: (c: CategoryRow, { months }: { months: number }, ctx: Ctx) =>
      Array.from({ length: months }, (_, i) => categorySpend(ctx, c, addMonth(thisMonth(), i - months + 1))),
    budget: (c: CategoryRow, { month }: { month?: string }, ctx: Ctx) => monthlyBudget(ctx.db, c, childrenOf(ctx, c.id), month ?? thisMonth()),
    budgetHistory: (c: CategoryRow, { months }: { months: number }, ctx: Ctx) =>
      Array.from({ length: months }, (_, i) => monthlyBudget(ctx.db, c, childrenOf(ctx, c.id), addMonth(thisMonth(), i - months + 1))),
    keyMetrics: (c: CategoryRow, _: unknown, ctx: Ctx) => keyMetrics(ctx.db, [c.id, ...childrenOf(ctx, c.id).map((k) => k.id)]),
  },

  CategoriesTotal: {
    spend: (_: unknown, { month }: { month?: string }, ctx: Ctx) => {
      const m = month ?? thisMonth()
      const parts = topLevel(ctx.db).filter((c) => !c.is_excluded).map((c) => categorySpend(ctx, c, m))
      const sum = (k: keyof (typeof parts)[number]) => round2(parts.reduce((s, p) => s + (p[k] as number), 0))
      return { id: `total:${m}`, month: m, amount: sum('amount'), comparisonAmount: sum('comparisonAmount'), paidRecurringAmount: sum('paidRecurringAmount'), unpaidRecurringAmount: sum('unpaidRecurringAmount') }
    },
    spendHistory: (_: unknown, { months }: { months: number }, ctx: Ctx) =>
      Array.from({ length: months }, (_, i) => {
        const m = addMonth(thisMonth(), i - months + 1)
        return resolvers.CategoriesTotal.spend(null, { month: m }, ctx)
      }),
    budget: (_: unknown, { month }: { month?: string }, ctx: Ctx) => {
      const m = month ?? thisMonth()
      const parts = topLevel(ctx.db).filter((c) => !c.is_excluded).map((c) => monthlyBudget(ctx.db, c, childrenOf(ctx, c.id), m))
      const sum = (k: 'amount' | 'rolloverAmount' | 'childAmount' | 'childRolloverAmount' | 'resolvedAmount') => round2(parts.reduce((s, p) => s + p[k], 0))
      return { id: `total:${m}`, month: m, amount: sum('amount'), rolloverAmount: sum('rolloverAmount'), childAmount: sum('childAmount'), childRolloverAmount: sum('childRolloverAmount'), resolvedAmount: sum('resolvedAmount') }
    },
    keyMetrics: (_: unknown, __: unknown, { db }: Ctx) => keyMetrics(db, null),
  },

  Transaction: {
    accountId: (t: TxRow) => t.account_id,
    account: (t: TxRow, _: unknown, { db }: Ctx) => getAccount(db, t.account_id),
    categoryId: (t: TxRow) => t.category_id,
    category: (t: TxRow, _: unknown, { db }: Ctx) => (t.category_id ? getCategory(db, t.category_id) : null),
    recurringId: (t: TxRow) => t.recurring_id,
    recurring: (t: TxRow, _: unknown, { db }: Ctx) => (t.recurring_id ? getRecurring(db, t.recurring_id) : null),
    parentId: (t: TxRow) => t.parent_id,
    isSplit: (t: TxRow) => !!t.is_split_parent,
    splits: (t: TxRow, _: unknown, { db }: Ctx) => (t.is_split_parent ? db.prepare('SELECT * FROM transactions WHERE parent_id = ? ORDER BY amount DESC').all(t.id) : []),
    isReviewed: (t: TxRow) => !!t.is_reviewed,
    isPending: (t: TxRow) => !!t.is_pending,
    createdAt: (t: TxRow) => t.created_at,
    tags: (t: TxRow, _: unknown, { db }: Ctx) =>
      db.prepare('SELECT g.* FROM tags g JOIN transaction_tags tt ON tt.tag_id = g.id WHERE tt.transaction_id = ? ORDER BY g.name').all(t.id),
    suggestedCategories: (t: TxRow, _: unknown, { db }: Ctx) =>
      suggestCategories(db, t.name, t.id).filter((id) => id !== t.category_id).map((id) => getCategory(db, id)).filter(Boolean),
  },

  Recurring: {
    categoryId: (r: RecurringRow) => r.category_id,
    category: (r: RecurringRow, _: unknown, { db }: Ctx) => (r.category_id ? getCategory(db, r.category_id) : null),
    rule: (r: RecurringRow) => ({ nameContains: r.rule_name_contains, minAmount: r.rule_min_amount, maxAmount: r.rule_max_amount }),
    nextPaymentDate: (r: RecurringRow, _: unknown, { db }: Ctx) => nextPayment(db, r).date,
    nextPaymentAmount: (r: RecurringRow, _: unknown, { db }: Ctx) => nextPayment(db, r).amount,
    payments: (r: RecurringRow, a: { from?: string; to?: string }, { db }: Ctx) =>
      payments(db, r, a.from ?? addMonths(today(), -12), a.to ?? addMonths(today(), 1)),
    transactions: (r: RecurringRow, _: unknown, { db }: Ctx) => db.prepare('SELECT * FROM transactions WHERE recurring_id = ? ORDER BY date DESC').all(r.id),
    keyMetrics: (r: RecurringRow, _: unknown, { db }: Ctx) => {
      const txs = recurringTransactions(db, r.id).filter((t) => t.date >= addMonths(today(), -12))
      const total = txs.reduce((s, t) => s + t.amount, 0)
      return { count: txs.length, totalSpent: round2(total), averageTransactionAmount: txs.length ? round2(total / txs.length) : 0 }
    },
  },

  Holding: {
    account: (h: { account_id: string }, _: unknown, { db }: Ctx) => getAccount(db, h.account_id),
    security: (h: { security_id: string }, _: unknown, { db }: Ctx) => db.prepare('SELECT * FROM securities WHERE id = ?').get(h.security_id),
    costBasis: (h: { cost_basis: number }) => h.cost_basis,
  },

  Security: {
    currentPrice: (s: { id: string }, _: unknown, { db }: Ctx) => currentPrice(db, s.id),
    change1d: (s: { id: string }, _: unknown, { db }: Ctx) => topMovers(db).find((m) => m.security.id === s.id)?.change ?? 0,
    prices: (s: { id: string }, { timeFrame }: { timeFrame: TimeFrame }, { db }: Ctx) => {
      const series = priceSeries(db, s.id)
      if (!series.length) return []
      const want = new Set(timeFrameDates(timeFrame, series[0].date))
      return series.filter((p) => want.has(p.date)).map((p) => ({ date: p.date, price: p.value }))
    },
  },

  Mutation: {
    createTransaction: (_: unknown, { input }: { input: Record<string, any> }, { db }: Ctx) =>
      tx(db, () => {
        must(getAccount(db, input.accountId), 'Account')
        if (!input.name?.trim()) throw bad('Name is required')
        const id = newId('tx')
        // Like Copilot's auto-categorization: reuse how this merchant was categorized before.
        const categoryId = input.categoryId ?? suggestCategories(db, input.name)[0] ?? null
        db.prepare(
          'INSERT INTO transactions (id, account_id, date, name, amount, type, category_id, notes, is_reviewed, created_at) VALUES (?,?,?,?,?,?,?,?,1,?)',
        ).run(id, input.accountId, input.date, input.name.trim(), round2(input.amount), input.type ?? 'regular', categoryId, input.notes ?? null, new Date().toISOString())
        if (input.tagIds) setTags(db, id, input.tagIds)
        assignRecurrings(db)
        return getTx(db, id)
      }),
    editTransaction: (_: unknown, { id, input }: { id: string; input: Record<string, any> }, { db }: Ctx) =>
      tx(db, () => {
        const t = must(getTx(db, id), 'Transaction')
        const cols: Record<string, string> = { name: 'name', date: 'date', amount: 'amount', type: 'type', categoryId: 'category_id', notes: 'notes', isReviewed: 'is_reviewed', recurringId: 'recurring_id' }
        if (t.is_split_parent && input.amount != null && input.amount !== t.amount) throw bad('Unsplit this transaction before changing its amount')
        for (const [k, col] of Object.entries(cols)) {
          if (!(k in input)) continue
          let v = input[k]
          if (k === 'isReviewed') v = v ? 1 : 0
          if (k === 'amount') v = round2(v)
          db.prepare(`UPDATE transactions SET ${col} = ? WHERE id = ?`).run(v ?? null, id)
        }
        if (input.tagIds) setTags(db, id, input.tagIds)
        return getTx(db, id)
      }),
    deleteTransaction: (_: unknown, { id }: { id: string }, { db }: Ctx) => {
      must(getTx(db, id), 'Transaction')
      db.prepare('DELETE FROM transactions WHERE id = ?').run(id)
      return true
    },
    splitTransaction: (_: unknown, { id, splits }: { id: string; splits: { amount: number; categoryId?: string; name?: string }[] }, { db }: Ctx) =>
      tx(db, () => {
        const t = must(getTx(db, id), 'Transaction')
        if (t.parent_id) throw bad('Cannot split a transaction that is already part of a split')
        if (splits.length < 2) throw bad('A split needs at least two parts')
        const total = round2(splits.reduce((s, p) => s + p.amount, 0))
        if (Math.abs(total - t.amount) > 0.005) throw bad(`Split parts add up to ${total}, but the transaction is ${t.amount}`)
        db.prepare('DELETE FROM transactions WHERE parent_id = ?').run(id)
        const ins = db.prepare(
          'INSERT INTO transactions (id, account_id, date, name, amount, type, category_id, parent_id, is_reviewed, is_pending, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        )
        for (const p of splits) {
          ins.run(newId('tx'), t.account_id, t.date, p.name?.trim() || t.name, round2(p.amount), t.type, p.categoryId ?? null, t.id, t.is_reviewed, t.is_pending, new Date().toISOString())
        }
        db.prepare('UPDATE transactions SET is_split_parent = 1 WHERE id = ?').run(id)
        return getTx(db, id)
      }),
    unsplitTransaction: (_: unknown, { id }: { id: string }, { db }: Ctx) =>
      tx(db, () => {
        must(getTx(db, id), 'Transaction')
        db.prepare('DELETE FROM transactions WHERE parent_id = ?').run(id)
        db.prepare('UPDATE transactions SET is_split_parent = 0 WHERE id = ?').run(id)
        return getTx(db, id)
      }),
    bulkEditTransactions: (_: unknown, { ids, input }: { ids: string[]; input: Record<string, any> }, { db }: Ctx) =>
      tx(db, () => {
        let n = 0
        for (const id of ids) {
          if (!getTx(db, id)) continue
          if ('categoryId' in input) db.prepare('UPDATE transactions SET category_id = ? WHERE id = ?').run(input.categoryId ?? null, id)
          if (input.isReviewed != null) db.prepare('UPDATE transactions SET is_reviewed = ? WHERE id = ?').run(input.isReviewed ? 1 : 0, id)
          if (input.type) db.prepare('UPDATE transactions SET type = ? WHERE id = ?').run(input.type, id)
          for (const tag of input.addTagIds ?? []) db.prepare('INSERT OR IGNORE INTO transaction_tags VALUES (?, ?)').run(id, tag)
          n++
        }
        return { updated: n }
      }),
    bulkDeleteTransactions: (_: unknown, { ids }: { ids: string[] }, { db }: Ctx) =>
      tx(db, () => ({ updated: ids.reduce((n, id) => n + Number(db.prepare('DELETE FROM transactions WHERE id = ?').run(id).changes), 0) })),

    createCategory: (_: unknown, { input }: { input: Record<string, any> }, { db }: Ctx) => {
      if (!input.name?.trim()) throw bad('Name is required')
      if (input.parentId) {
        const p = must(getCategory(db, input.parentId), 'Parent category')
        if (p.parent_id) throw bad('Categories can only be nested one level deep')
      }
      const id = newId('cat')
      const sort = (db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM categories').get() as { s: number }).s
      db.prepare('INSERT INTO categories (id, name, emoji, color, parent_id, is_excluded, rollover_enabled, sort) VALUES (?,?,?,?,?,?,?,?)').run(
        id, input.name.trim(), input.emoji ?? '📁', input.color ?? 'blue', input.parentId ?? null, input.isExcluded ? 1 : 0, input.rolloverEnabled ? 1 : 0, sort,
      )
      return getCategory(db, id)
    },
    editCategory: (_: unknown, { id, input }: { id: string; input: Record<string, any> }, { db }: Ctx) => {
      must(getCategory(db, id), 'Category')
      const cols: Record<string, string> = { name: 'name', emoji: 'emoji', color: 'color', parentId: 'parent_id', isExcluded: 'is_excluded', rolloverEnabled: 'rollover_enabled' }
      if (input.parentId === id) throw bad('A category cannot be its own parent')
      for (const [k, col] of Object.entries(cols)) {
        if (!(k in input)) continue
        const v = typeof input[k] === 'boolean' ? (input[k] ? 1 : 0) : input[k]
        db.prepare(`UPDATE categories SET ${col} = ? WHERE id = ?`).run(v ?? null, id)
      }
      return getCategory(db, id)
    },
    deleteCategory: (_: unknown, { id }: { id: string }, { db }: Ctx) =>
      tx(db, () => {
        must(getCategory(db, id), 'Category')
        if (['cat_income', 'cat_transfers'].includes(id)) throw bad('This category cannot be deleted')
        // Keep subcategories by moving them up a level.
        db.prepare('UPDATE categories SET parent_id = NULL WHERE parent_id = ?').run(id)
        db.prepare('DELETE FROM categories WHERE id = ?').run(id)
        return true
      }),
    setBudget: (_: unknown, a: { categoryId: string; amount: number; month?: string }, { db }: Ctx) => {
      must(getCategory(db, a.categoryId), 'Category')
      if (a.amount < 0) throw bad('Budget cannot be negative')
      setBudget(db, a.categoryId, a.month ?? thisMonth(), round2(a.amount))
      return getCategory(db, a.categoryId)
    },

    createRecurring: (_: unknown, { input }: { input: Record<string, any> }, { db }: Ctx) =>
      tx(db, () => {
        if (!input.name?.trim() || !input.frequency) throw bad('Name and frequency are required')
        const id = createRecurring(db, {
          name: input.name.trim(), emoji: input.emoji, categoryId: input.categoryId, frequency: input.frequency as Frequency,
          ruleNameContains: (input.ruleNameContains ?? input.name).trim(), minAmount: input.minAmount, maxAmount: input.maxAmount,
        })
        return getRecurring(db, id)
      }),
    editRecurring: (_: unknown, { id, input }: { id: string; input: Record<string, any> }, { db }: Ctx) =>
      tx(db, () => {
        must(getRecurring(db, id), 'Recurring')
        const cols: Record<string, string> = { name: 'name', emoji: 'emoji', categoryId: 'category_id', frequency: 'frequency', state: 'state', ruleNameContains: 'rule_name_contains', minAmount: 'rule_min_amount', maxAmount: 'rule_max_amount' }
        for (const [k, col] of Object.entries(cols)) if (k in input) db.prepare(`UPDATE recurrings SET ${col} = ? WHERE id = ?`).run(input[k] ?? null, id)
        // Rules changed: re-match from scratch for this recurring.
        if (['ruleNameContains', 'minAmount', 'maxAmount'].some((k) => k in input)) {
          db.prepare('UPDATE transactions SET recurring_id = NULL WHERE recurring_id = ?').run(id)
          assignRecurrings(db, id)
        }
        return getRecurring(db, id)
      }),
    deleteRecurring: (_: unknown, { id }: { id: string }, { db }: Ctx) => {
      must(getRecurring(db, id), 'Recurring')
      db.prepare('DELETE FROM recurrings WHERE id = ?').run(id)
      return true
    },
    addTransactionToRecurring: (_: unknown, a: { transactionId: string; recurringId: string }, { db }: Ctx) => {
      must(getTx(db, a.transactionId), 'Transaction')
      must(getRecurring(db, a.recurringId), 'Recurring')
      db.prepare('UPDATE transactions SET recurring_id = ? WHERE id = ?').run(a.recurringId, a.transactionId)
      return getTx(db, a.transactionId)
    },
    createSuggestedRecurrings: (_: unknown, { names }: { names?: string[] }, { db }: Ctx) =>
      tx(db, () =>
        suggestRecurrings(db)
          .filter((s) => !names || names.includes(s.name))
          .map((s) => {
            const emoji = s.categoryId ? getCategory(db, s.categoryId)?.emoji : undefined
            return getRecurring(db, createRecurring(db, { name: s.name, emoji, categoryId: s.categoryId, frequency: s.frequency, ruleNameContains: s.ruleNameContains, minAmount: s.minAmount, maxAmount: s.maxAmount }))
          }),
      ),

    createAccount: (_: unknown, { input }: { input: Record<string, any> }, { db }: Ctx) =>
      tx(db, () => {
        if (!input.name?.trim() || !input.type) throw bad('Name and type are required')
        const id = newId('acct')
        const balance = round2(input.balance ?? 0)
        db.prepare('INSERT INTO accounts (id, name, type, sub_type, color, balance, is_manual, updated_at) VALUES (?,?,?,?,?,?,1,?)').run(
          id, input.name.trim(), input.type, input.subType ?? null, input.color ?? '#5c6f8a', balance, new Date().toISOString(),
        )
        db.prepare('INSERT INTO balance_history (account_id, date, balance) VALUES (?,?,?)').run(id, today(), balance)
        return getAccount(db, id)
      }),
    editAccount: (_: unknown, { id, input }: { id: string; input: Record<string, any> }, { db }: Ctx) =>
      tx(db, () => {
        const a = must(getAccount(db, id), 'Account')
        const cols: Record<string, string> = { name: 'name', subType: 'sub_type', color: 'color', isHidden: 'is_hidden', isClosed: 'is_closed' }
        for (const [k, col] of Object.entries(cols)) {
          if (!(k in input)) continue
          const v = typeof input[k] === 'boolean' ? (input[k] ? 1 : 0) : input[k]
          db.prepare(`UPDATE accounts SET ${col} = ? WHERE id = ?`).run(v ?? null, id)
        }
        if (input.balance != null) {
          if (!a.is_manual) throw bad('Only manual accounts can have their balance edited')
          db.prepare('UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?').run(round2(input.balance), new Date().toISOString(), id)
          db.prepare('INSERT INTO balance_history (account_id, date, balance) VALUES (?,?,?) ON CONFLICT DO UPDATE SET balance = excluded.balance').run(id, today(), round2(input.balance))
        }
        return getAccount(db, id)
      }),
    deleteAccount: (_: unknown, { id }: { id: string }, { db }: Ctx) => {
      const a = must(getAccount(db, id), 'Account')
      if (!a.is_manual) throw bad('Linked accounts are removed by disconnecting them; only manual accounts can be deleted')
      db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
      return true
    },

    createTag: (_: unknown, { input }: { input: { name?: string; color?: string } }, { db }: Ctx) => {
      if (!input.name?.trim()) throw bad('Name is required')
      const id = newId('tag')
      try {
        db.prepare('INSERT INTO tags (id, name, color) VALUES (?,?,?)').run(id, input.name.trim(), input.color ?? 'blue')
      } catch {
        throw bad('A tag with that name already exists')
      }
      return db.prepare('SELECT * FROM tags WHERE id = ?').get(id)
    },
    editTag: (_: unknown, { id, input }: { id: string; input: { name?: string; color?: string } }, { db }: Ctx) => {
      must(db.prepare('SELECT id FROM tags WHERE id = ?').get(id), 'Tag')
      if (input.name) db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(input.name.trim(), id)
      if (input.color) db.prepare('UPDATE tags SET color = ? WHERE id = ?').run(input.color, id)
      return db.prepare('SELECT * FROM tags WHERE id = ?').get(id)
    },
    deleteTag: (_: unknown, { id }: { id: string }, { db }: Ctx) => db.prepare('DELETE FROM tags WHERE id = ?').run(id).changes > 0,
  },
}
