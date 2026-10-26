import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { addDays, addMonths, monthOf, openDb, today, type DB } from './db.ts'
import { monthlyBudget, rolloverAmount, setBudget, type CategoryRow } from './logic/budget.ts'
import { assignRecurrings, createRecurring, detectFrequency, nextDate, nextPayment, suggestRecurrings } from './logic/recurring.ts'
import { resolvers, type Ctx } from './resolvers.ts'
import { seed } from './seed.ts'

function fresh(): DB {
  const db = openDb(':memory:')
  db.prepare("INSERT INTO accounts (id, name, type, updated_at) VALUES ('a', 'Card', 'credit', '2026-01-01')").run()
  return db
}
const addCat = (db: DB, id: string, rollover = false, parent: string | null = null) => {
  db.prepare('INSERT INTO categories (id, name, parent_id, rollover_enabled) VALUES (?, ?, ?, ?)').run(id, id, parent, rollover ? 1 : 0)
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as CategoryRow
}
let n = 0
const addTx = (db: DB, date: string, name: string, amount: number, cat: string | null = null, type = 'regular') =>
  db.prepare('INSERT INTO transactions (id, account_id, date, name, amount, type, category_id, created_at) VALUES (?,?,?,?,?,?,?,?)').run(
    `t${n++}`, 'a', date, name, amount, type, cat, date,
  )

test('addMonths clamps to the end of shorter months', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28')
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29')
  assert.equal(addMonths('2026-03-15', -3), '2025-12-15')
})

test('rollover carries unspent and overspent budget forward', () => {
  const db = fresh()
  const cat = addCat(db, 'fun', true)
  setBudget(db, 'fun', '2026-01', 100)
  addTx(db, '2026-01-10', 'Movies', 60, 'fun') // 40 left
  addTx(db, '2026-02-10', 'Concert', 170, 'fun') // 100 + 40 - 170 = -30
  assert.equal(rolloverAmount(db, cat, '2026-01'), 0)
  assert.equal(rolloverAmount(db, cat, '2026-02'), 40)
  assert.equal(rolloverAmount(db, cat, '2026-03'), -30)
  assert.equal(monthlyBudget(db, cat, [], '2026-03').resolvedAmount, 70)
})

test('rollover is zero when disabled, and refunds reduce spend', () => {
  const db = fresh()
  const cat = addCat(db, 'shop', false)
  setBudget(db, 'shop', '2026-01', 100)
  addTx(db, '2026-01-10', 'Store', 80, 'shop')
  addTx(db, '2026-01-12', 'Store refund', -30, 'shop')
  assert.equal(rolloverAmount(db, cat, '2026-02'), 0)
  db.prepare('UPDATE categories SET rollover_enabled = 1').run()
  assert.equal(rolloverAmount(db, { ...cat, rollover_enabled: 1 }, '2026-02'), 50)
})

test('parent budget includes children', () => {
  const db = fresh()
  const parent = addCat(db, 'food')
  const kid1 = addCat(db, 'groceries', false, 'food')
  const kid2 = addCat(db, 'coffee', false, 'food')
  setBudget(db, 'groceries', '2026-01', 500)
  setBudget(db, 'coffee', '2026-01', 50)
  setBudget(db, 'groceries', '2026-04', 600)
  const b = monthlyBudget(db, parent, [kid1, kid2], '2026-05')
  assert.equal(b.childAmount, 650)
  assert.equal(b.resolvedAmount, 650)
})

test('detectFrequency recognizes schedules and rejects noise', () => {
  assert.equal(detectFrequency(['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-04']), 'monthly')
  assert.equal(detectFrequency(['2026-01-02', '2026-01-16', '2026-01-30', '2026-02-13']), 'biweekly')
  assert.equal(detectFrequency(['2026-01-02', '2026-01-04', '2026-02-20', '2026-02-21']), null)
  assert.equal(detectFrequency(['2026-01-02', '2026-02-02']), null)
})

test('suggestions find untracked subscriptions and skip tracked or stopped ones', () => {
  const db = fresh()
  const t = today()
  for (let i = 0; i < 5; i++) addTx(db, addMonths(t, -i), 'NETFLIX.COM #123', 15.49)
  for (let i = 0; i < 5; i++) addTx(db, addMonths(t, -i), 'Spotify', 11.99)
  for (let i = 8; i < 13; i++) addTx(db, addMonths(t, -i), 'Old Gym', 50) // stopped 8 months ago
  createRecurring(db, { name: 'Spotify', frequency: 'monthly', ruleNameContains: 'spotify' })
  const s = suggestRecurrings(db)
  assert.deepEqual(s.map((x) => x.name), ['NETFLIX.COM'])
  assert.equal(s[0].frequency, 'monthly')
  assert.ok(s[0].minAmount! < 15.49 && s[0].maxAmount! > 15.49)
})

test('next payment follows the last charge and rolls past missed dates', () => {
  const db = fresh()
  const t = today()
  addTx(db, addMonths(t, -1), 'Netflix', 15.49)
  const id = createRecurring(db, { name: 'Netflix', frequency: 'monthly', ruleNameContains: 'netflix' })
  const r = db.prepare('SELECT * FROM recurrings WHERE id = ?').get(id) as never
  assert.deepEqual(nextPayment(db, r), { date: nextDate(addMonths(t, -1), 'monthly'), amount: 15.49 })
  // As of 3 months later, the next date is in the future, not in the past.
  const later = addMonths(t, 3)
  const next = nextPayment(db, r, later).date!
  assert.ok(next >= addDays(later, -3) && next <= addMonths(later, 1), next)
})

test('recurring rules respect amount ranges', () => {
  const db = fresh()
  addTx(db, '2026-01-01', 'Amazon Prime', 14.99)
  addTx(db, '2026-01-03', 'Amazon', 87.1)
  createRecurring(db, { name: 'Prime', frequency: 'monthly', ruleNameContains: 'amazon', minAmount: 10, maxAmount: 20 })
  const linked = db.prepare('SELECT name FROM transactions WHERE recurring_id IS NOT NULL').all() as { name: string }[]
  assert.deepEqual(linked.map((r) => r.name), ['Amazon Prime'])
  assert.equal(assignRecurrings(db), 0)
})

test('split must add up, and split parts replace the parent in spend', async () => {
  const db = fresh()
  addCat(db, 'groceries')
  addCat(db, 'home')
  setBudget(db, 'groceries', monthOf(today()), 100)
  addTx(db, today(), 'Target', 100, 'groceries')
  const ctx: Ctx = { db, cache: new Map() }
  const id = (db.prepare("SELECT id FROM transactions WHERE name = 'Target'").get() as { id: string }).id
  assert.throws(() => resolvers.Mutation.splitTransaction(null, { id, splits: [{ amount: 60 }, { amount: 30 }] }, ctx), /add up/)
  resolvers.Mutation.splitTransaction(null, { id, splits: [{ amount: 60, categoryId: 'groceries' }, { amount: 40, categoryId: 'home' }] }, ctx)
  const cat = db.prepare("SELECT * FROM categories WHERE id = 'groceries'").get() as CategoryRow
  assert.equal(resolvers.Category.spend(cat, {}, { db, cache: new Map() }).amount, 60)
  // The list shows the parent once, not the parts.
  const list = resolvers.Query.transactions(null, { first: 10 }, ctx)
  assert.equal(list.totalCount, 1)
})

test('seed data is consistent', () => {
  const db = openDb(':memory:')
  seed(db)
  const orphans = db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE category_id IS NULL').get() as { n: number }
  assert.equal(orphans.n, 1) // the one purchase left uncategorized on purpose
  const future = db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE date > ?').get(today()) as { n: number }
  assert.equal(future.n, 0)
  assert.ok(suggestRecurrings(db).length >= 5)
})
