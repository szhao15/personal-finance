import { rmSync } from 'node:fs'
import { addDays, addMonth, addMonths, fmtDate, monthOf, newId, openDb, round2, today, tx, type DB } from './db.ts'
import { setBudget } from './logic/budget.ts'
import { assignRecurrings, createRecurring } from './logic/recurring.ts'

// Small deterministic RNG so every seed produces the same data.
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

type Cat = { key: string; name: string; emoji: string; color: string; children?: Cat[]; excluded?: boolean; rollover?: boolean; budget?: number }

const CATEGORIES: Cat[] = [
  { key: 'food', name: 'Food & Drink', emoji: '🍔', color: 'orange', children: [
    { key: 'restaurants', name: 'Restaurants', emoji: '🥟', color: 'orange', budget: 350 },
    { key: 'groceries', name: 'Groceries', emoji: '🥑', color: 'green', budget: 550 },
    { key: 'coffee', name: 'Coffee', emoji: '☕️', color: 'brown', budget: 60 },
  ] },
  { key: 'necessities', name: 'Necessities', emoji: '🏠', color: 'blue', children: [
    { key: 'rent', name: 'Rent', emoji: '🔑', color: 'yellow', budget: 2400 },
    { key: 'utilities', name: 'Utilities', emoji: '⚡️', color: 'yellow', budget: 160 },
    { key: 'insurance', name: 'Insurance', emoji: '☂️', color: 'purple', budget: 150 },
    { key: 'phone', name: 'Phone & Internet', emoji: '📱', color: 'blue', budget: 150 },
  ] },
  { key: 'transport', name: 'Transportation', emoji: '🚙', color: 'yellow', children: [
    { key: 'rideshare', name: 'Rideshare', emoji: '🚕', color: 'yellow', budget: 120 },
    { key: 'gas', name: 'Gas', emoji: '⛽️', color: 'red', budget: 140 },
    { key: 'transit', name: 'Public Transit', emoji: '🚇', color: 'blue', budget: 90 },
  ] },
  { key: 'shopping', name: 'Shopping', emoji: '🛍️', color: 'pink', children: [
    { key: 'clothing', name: 'Clothing', emoji: '👕', color: 'pink', budget: 150, rollover: true },
    { key: 'home', name: 'Home Goods', emoji: '🛋️', color: 'teal', budget: 120, rollover: true },
    { key: 'amazon', name: 'Online Shopping', emoji: '📦', color: 'orange', budget: 150 },
  ] },
  { key: 'fun', name: 'Fun', emoji: '🎉', color: 'purple', children: [
    { key: 'entertainment', name: 'Entertainment', emoji: '🍿', color: 'red', budget: 120, rollover: true },
    { key: 'subscriptions', name: 'Subscriptions', emoji: '📺', color: 'blue', budget: 60 },
    { key: 'travel', name: 'Travel', emoji: '✈️', color: 'teal', budget: 300, rollover: true },
  ] },
  { key: 'health', name: 'Health', emoji: '💪', color: 'green', children: [
    { key: 'gym', name: 'Gym', emoji: '🏋️', color: 'green', budget: 80 },
    { key: 'pharmacy', name: 'Pharmacy', emoji: '💊', color: 'red', budget: 40 },
  ] },
  { key: 'income', name: 'Income', emoji: '💰', color: 'green', excluded: true },
  { key: 'transfers', name: 'Transfers', emoji: '↔️', color: 'gray', excluded: true },
]

// Everyday merchants: [name, category, min, max, times per month, which card].
const MERCHANTS: [string, string, number, number, number, string][] = [
  ['Trader Joe\'s', 'groceries', 35, 110, 4, 'amex'],
  ['Whole Foods Market', 'groceries', 20, 140, 2, 'amex'],
  ['Park Slope Food Coop', 'groceries', 25, 80, 2, 'amex'],
  ['Joe Coffee', 'coffee', 4.5, 7.5, 6, 'sapphire'],
  ['Blue Bottle Coffee', 'coffee', 5, 9, 3, 'sapphire'],
  ['Petite Dumpling', 'restaurants', 22, 48, 2, 'sapphire'],
  ['Sweetgreen', 'restaurants', 14, 19, 4, 'sapphire'],
  ['Lucali', 'restaurants', 45, 120, 1, 'sapphire'],
  ['Uber', 'rideshare', 11, 38, 3, 'sapphire'],
  ['Lyft', 'rideshare', 9, 32, 2, 'sapphire'],
  ['Shell', 'gas', 38, 62, 2, 'amex'],
  ['MTA OMNY', 'transit', 2.9, 2.9, 14, 'sapphire'],
  ['Uniqlo', 'clothing', 30, 120, 0.7, 'sapphire'],
  ['Target', 'home', 18, 95, 1.2, 'amex'],
  ['Amazon', 'amazon', 9, 85, 3, 'amex'],
  ['Film Noir Cinemas', 'entertainment', 14, 36, 1.2, 'sapphire'],
  ['Brooklyn Bowl', 'entertainment', 25, 70, 0.5, 'sapphire'],
  ['CVS Pharmacy', 'pharmacy', 6, 34, 1, 'amex'],
]

// Fixed charges: [name, category, amount, day of month, card, tracked already?, jitter].
const BILLS: [string, string, number, number, string, boolean, number][] = [
  ['Rent - Greenpoint Mgmt', 'rent', 2400, 1, 'checking', true, 0],
  ['Netflix', 'subscriptions', 15.49, 7, 'amex', true, 0],
  ['Spotify', 'subscriptions', 11.99, 12, 'sapphire', true, 0],
  ['Equinox', 'gym', 79.99, 3, 'sapphire', true, 0],
  ['Con Edison', 'utilities', 95, 18, 'checking', false, 0.35],
  ['Verizon Wireless', 'phone', 85, 22, 'amex', false, 0],
  ['Spectrum Internet', 'phone', 59.99, 15, 'checking', false, 0],
  ['GEICO', 'insurance', 142.5, 9, 'checking', false, 0],
  ['iCloud Storage', 'subscriptions', 2.99, 25, 'sapphire', false, 0],
  ['NYTimes', 'subscriptions', 4, 4, 'amex', false, 0],
]

const SECURITIES: [string, string, string, number, number, number][] = [
  // symbol, name, type, price a year ago, yearly drift, volatility
  ['VTI', 'Vanguard Total Stock Market ETF', 'etf', 262, 0.14, 0.009],
  ['VXUS', 'Vanguard Total International Stock ETF', 'etf', 61, 0.08, 0.008],
  ['BND', 'Vanguard Total Bond Market ETF', 'etf', 72, 0.02, 0.003],
  ['AAPL', 'Apple', 'equity', 221, 0.12, 0.016],
  ['MSFT', 'Microsoft', 'equity', 418, 0.09, 0.014],
  ['RIVN', 'Rivian', 'equity', 13, -0.05, 0.035],
  ['BTC', 'Bitcoin', 'crypto', 61000, 0.35, 0.03],
  ['ETH', 'Ethereum', 'crypto', 2500, 0.1, 0.035],
]

export function seed(db: DB, end = today()) {
  const r = rng(42)
  const between = (a: number, b: number) => a + (b - a) * r()
  const start = addMonths(end, -14)
  const now = new Date().toISOString()

  tx(db, () => {
    db.exec('DELETE FROM transaction_tags; DELETE FROM transactions; DELETE FROM recurrings; DELETE FROM budgets; DELETE FROM categories; DELETE FROM tags; DELETE FROM holdings; DELETE FROM security_prices; DELETE FROM securities; DELETE FROM balance_history; DELETE FROM accounts;')

    // ---- accounts ----
    const acct = (key: string, name: string, type: string, sub: string, inst: string | null, mask: string | null, color: string, extra: { limit?: number; manual?: boolean } = {}) => {
      const id = `acct_${key}`
      db.prepare(
        'INSERT INTO accounts (id, name, type, sub_type, institution, mask, color, credit_limit, is_manual, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).run(id, name, type, sub, inst, mask, color, extra.limit ?? null, extra.manual ? 1 : 0, now)
      return id
    }
    const A = {
      checking: acct('checking', 'Everyday Checking', 'depository', 'checking', 'Chase', '4417', '#1a66ff'),
      savings: acct('savings', 'High Yield Savings', 'depository', 'savings', 'Ally', '9021', '#9019e6'),
      amex: acct('amex', 'Gold Card', 'credit', 'credit card', 'American Express', '1008', '#c08635', { limit: 15000 }),
      sapphire: acct('sapphire', 'Sapphire Preferred', 'credit', 'credit card', 'Chase', '7731', '#0047cc', { limit: 12000 }),
      brokerage: acct('brokerage', 'Brokerage', 'investment', 'brokerage', 'Vanguard', '3390', '#e5072d'),
      crypto: acct('crypto', 'Crypto', 'investment', 'crypto exchange', 'Coinbase', null, '#1a66ff'),
      home: acct('home', '123 Main St', 'real_estate', 'home', null, null, '#40bf40', { manual: true }),
      car: acct('car', 'Auto Loan', 'loan', 'auto', 'Capital One', '5520', '#5c6f8a'),
    }

    // ---- categories + budgets ----
    const C: Record<string, string> = {}
    const budgetStart = monthOf(addMonths(end, -6))
    let sort = 0
    const insertCat = (c: Cat, parent: string | null) => {
      const id = `cat_${c.key}`
      C[c.key] = id
      db.prepare('INSERT INTO categories (id, name, emoji, color, parent_id, is_excluded, rollover_enabled, sort) VALUES (?,?,?,?,?,?,?,?)').run(
        id, c.name, c.emoji, c.color, parent, c.excluded ? 1 : 0, c.rollover ? 1 : 0, sort++,
      )
      if (c.budget) setBudget(db, id, budgetStart, c.budget)
      c.children?.forEach((k) => insertCat(k, id))
    }
    CATEGORIES.forEach((c) => insertCat(c, null))
    // A mid-year budget bump, so history shows a change.
    setBudget(db, C.groceries, addMonth(budgetStart, 3), 600)

    // ---- tags ----
    const T = {
      vacation: newId('tag'),
      workExpense: newId('tag'),
      gift: newId('tag'),
    }
    db.prepare('INSERT INTO tags (id, name, color) VALUES (?,?,?), (?,?,?), (?,?,?)').run(
      T.vacation, 'Vacation', 'teal', T.workExpense, 'Work expense', 'blue', T.gift, 'Gift', 'pink',
    )

    // ---- transactions ----
    const ins = db.prepare(
      'INSERT INTO transactions (id, account_id, date, name, amount, type, category_id, is_reviewed, is_pending, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    )
    const reviewCutoff = addDays(end, -6)
    const add = (date: string, name: string, amount: number, catKey: string | null, account: string, type = 'regular') => {
      if (date > end || date < start) return null
      const id = newId('tx')
      const pending = date > addDays(end, -2) ? 1 : 0
      ins.run(id, account, date, name, round2(amount), type, catKey ? C[catKey] : null, date < reviewCutoff ? 1 : 0, pending, `${date}T12:00:00Z`)
      return id
    }
    const cardFor = (k: string) => A[k as keyof typeof A]

    for (let m = monthOf(start); m <= monthOf(end); m = addMonth(m, 1)) {
      const dim = Number(fmtDate(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0))).slice(8))
      // everyday spending
      for (const [name, cat, lo, hi, perMonth, card] of MERCHANTS) {
        let n = Math.floor(perMonth) + (r() < perMonth % 1 ? 1 : 0)
        while (n-- > 0) add(`${m}-${String(1 + Math.floor(r() * dim)).padStart(2, '0')}`, name, between(lo, hi), cat, cardFor(card))
      }
      // bills
      for (const [name, cat, amt, day, card, , jitter] of BILLS) {
        const a = jitter ? amt * (1 + (r() - 0.5) * jitter) : amt
        add(`${m}-${String(Math.min(day, dim)).padStart(2, '0')}`, name, a, cat, cardFor(card))
      }
      // pay card balances from checking (transfers don't count as spend)
      add(`${m}-26`, 'Amex Autopay', between(1100, 1700), 'transfers', A.checking, 'internal_transfer')
      add(`${m}-27`, 'Chase Card Payment', between(700, 1100), 'transfers', A.checking, 'internal_transfer')
      add(`${m}-05`, 'Capital One Auto Pay', 412.37, 'transfers', A.checking, 'internal_transfer')
      add(`${m}-20`, 'Transfer to Savings', 500, 'transfers', A.checking, 'internal_transfer')
      // occasional refund
      if (r() < 0.3) add(`${m}-${String(5 + Math.floor(r() * 20)).padStart(2, '0')}`, 'Amazon Refund', -between(12, 60), 'amazon', A.amex)
    }
    // paychecks every other Friday
    let pay = start
    while (new Date(`${pay}T00:00:00Z`).getUTCDay() !== 5) pay = addDays(pay, 1)
    for (; pay <= end; pay = addDays(pay, 14)) add(pay, 'Acme Corp Payroll', -3650, 'income', A.checking, 'income')
    add(addMonths(end, -2), 'Interest Payment', -42.18, 'income', A.savings, 'income')

    // a trip, tagged
    const trip = addMonths(end, -4)
    for (const [d, n, a, c] of [[0, 'Delta Air Lines', 412.6, 'travel'], [1, 'Hotel Lisboa', 640, 'travel'], [2, 'Time Out Market', 48.2, 'restaurants']] as const) {
      const id = add(addDays(trip, d), n, a, c, A.sapphire)
      if (id) db.prepare('INSERT INTO transaction_tags VALUES (?, ?)').run(id, T.vacation)
    }
    // A purchase that's still uncategorized, to show suggestions.
    add(addDays(end, -1), 'Sweetgreen', 17.45, null, A.sapphire)

    // ---- recurrings already tracked ----
    for (const [name, cat, , , , tracked] of BILLS) {
      if (!tracked) continue
      const emoji = CATEGORIES.flatMap((c) => c.children ?? []).find((c) => c.key === cat)?.emoji
      createRecurring(db, { name: name.split(' - ')[0], emoji, categoryId: C[cat], frequency: 'monthly', ruleNameContains: name.split(' - ')[0].toLowerCase() })
    }
    db.prepare("INSERT INTO recurrings (id, name, emoji, category_id, frequency, rule_name_contains) VALUES (?, 'Paycheck', '💰', ?, 'biweekly', 'acme corp payroll')").run(newId('rec'), C.income)
    assignRecurrings(db)

    // ---- securities, prices, holdings ----
    const priceStart = addMonths(end, -14)
    const S: Record<string, string> = {}
    for (const [sym, name, type, p0, drift, vol] of SECURITIES) {
      const id = `sec_${sym.toLowerCase()}`
      S[sym] = id
      db.prepare('INSERT INTO securities (id, symbol, name, type) VALUES (?,?,?,?)').run(id, sym, name, type)
      let p = p0
      const insP = db.prepare('INSERT INTO security_prices (security_id, date, price) VALUES (?,?,?)')
      for (let d = priceStart; d <= end; d = addDays(d, 1)) {
        p *= 1 + drift / 365 + (r() - 0.5) * 2 * vol
        insP.run(id, d, round2(p))
      }
    }
    const hold = db.prepare('INSERT INTO holdings (id, account_id, security_id, quantity, cost_basis) VALUES (?,?,?,?,?)')
    const holdings: [string, string, number, number][] = [
      [A.brokerage, 'VTI', 120, 26100], [A.brokerage, 'VXUS', 180, 10300], [A.brokerage, 'BND', 90, 6550],
      [A.brokerage, 'AAPL', 25, 4800], [A.brokerage, 'MSFT', 10, 3900], [A.brokerage, 'RIVN', 80, 1240],
      [A.crypto, 'BTC', 0.12, 6100], [A.crypto, 'ETH', 1.6, 3900],
    ]
    for (const [a, sym, q, cost] of holdings) hold.run(newId('hold'), a, S[sym], q, cost)

    // ---- balance histories (weekly points) ----
    const bh = db.prepare('INSERT INTO balance_history (account_id, date, balance) VALUES (?,?,?)')
    const setBal = db.prepare('UPDATE accounts SET balance = ? WHERE id = ?')
    const walkAccount = (id: string, from: number, to: number, noise: number) => {
      const weeks = Math.ceil((Date.parse(end) - Date.parse(start)) / (7 * 86400000))
      let i = 0
      for (let d = start; d < end; d = addDays(d, 7), i++) {
        const v = from + ((to - from) * i) / weeks + (r() - 0.5) * noise
        bh.run(id, d, round2(Math.max(0, v)))
      }
      setBal.run(round2(to), id)
    }
    walkAccount(A.checking, 6200, 8420.55, 2400)
    walkAccount(A.savings, 18000, 26500, 300)
    walkAccount(A.amex, 1300, 1482.12, 700)
    walkAccount(A.sapphire, 900, 1094.67, 500)
    walkAccount(A.home, 640000, 668000, 4000)
    walkAccount(A.car, 21500, 15240, 0)
    // investment accounts follow their holdings' value
    for (const acc of [A.brokerage, A.crypto]) {
      const rows = db
        .prepare('SELECT h.quantity, h.security_id FROM holdings h WHERE h.account_id = ?')
        .all(acc) as { quantity: number; security_id: string }[]
      const priceAt = db.prepare('SELECT price FROM security_prices WHERE security_id = ? AND date <= ? ORDER BY date DESC LIMIT 1')
      let last = 0
      for (let d = start; d <= end; d = addDays(d, 7)) {
        last = rows.reduce((s, h) => s + h.quantity * ((priceAt.get(h.security_id, d) as { price: number } | undefined)?.price ?? 0), 0)
        bh.run(acc, d, round2(last))
      }
      const nowVal = rows.reduce((s, h) => s + h.quantity * ((priceAt.get(h.security_id, end) as { price: number }).price), 0)
      setBal.run(round2(nowVal), acc)
    }
  })
}

// Run directly: rebuild the local database.
if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.env.DB_PATH ?? new URL('../data/finance.db', import.meta.url).pathname
  rmSync(path, { force: true })
  rmSync(`${path}-wal`, { force: true })
  rmSync(`${path}-shm`, { force: true })
  const db = openDb(path)
  seed(db)
  const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n
  console.log(`Seeded ${path}: ${count('transactions')} transactions, ${count('accounts')} accounts, ${count('recurrings')} recurrings, ${count('categories')} categories`)
}
