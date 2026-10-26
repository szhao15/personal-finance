import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Conventions:
// - Dates are 'YYYY-MM-DD' strings, months are 'YYYY-MM'.
// - Transaction amounts: positive = money out (spend), negative = money in (income, refunds).
// - Credit and loan account balances are positive amounts owed.

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('depository','credit','investment','loan','real_estate','other')),
  sub_type TEXT,
  institution TEXT,
  mask TEXT,
  color TEXT NOT NULL DEFAULT '#3d82ff',
  balance REAL NOT NULL DEFAULT 0,
  credit_limit REAL,
  is_manual INTEGER NOT NULL DEFAULT 0,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  is_closed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS balance_history (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  balance REAL NOT NULL,
  PRIMARY KEY (account_id, date)
);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '📁',
  color TEXT NOT NULL DEFAULT 'blue',
  parent_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  is_excluded INTEGER NOT NULL DEFAULT 0,
  rollover_enabled INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);
-- A budget row applies from its month until a later row replaces it.
CREATE TABLE IF NOT EXISTS budgets (
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount REAL NOT NULL,
  PRIMARY KEY (category_id, month)
);
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT 'blue'
);
CREATE TABLE IF NOT EXISTS recurrings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🔁',
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly','biweekly','monthly','quarterly','semiannually','yearly')),
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','paused','archived')),
  rule_name_contains TEXT NOT NULL,
  rule_min_amount REAL,
  rule_max_amount REAL
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  type TEXT NOT NULL DEFAULT 'regular' CHECK (type IN ('regular','income','internal_transfer')),
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  recurring_id TEXT REFERENCES recurrings(id) ON DELETE SET NULL,
  parent_id TEXT REFERENCES transactions(id) ON DELETE CASCADE,
  is_split_parent INTEGER NOT NULL DEFAULT 0,
  is_reviewed INTEGER NOT NULL DEFAULT 0,
  is_pending INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tx_date ON transactions(date);
CREATE INDEX IF NOT EXISTS tx_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS tx_account ON transactions(account_id);
CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);
CREATE TABLE IF NOT EXISTS securities (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('equity','etf','crypto','mutual_fund','cash'))
);
CREATE TABLE IF NOT EXISTS security_prices (
  security_id TEXT NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  price REAL NOT NULL,
  PRIMARY KEY (security_id, date)
);
CREATE TABLE IF NOT EXISTS holdings (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  security_id TEXT NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  quantity REAL NOT NULL,
  cost_basis REAL NOT NULL
);
`

export type DB = DatabaseSync

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;')
  db.exec(SCHEMA)
  return db
}

export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`

// ---- date helpers (UTC-based to avoid DST drift) ----
export const toDate = (s: string) => new Date(`${s}T00:00:00Z`)
export const fmtDate = (d: Date) => d.toISOString().slice(0, 10)
export const monthOf = (date: string) => date.slice(0, 7)
/** Today in the machine's local time zone (what the user thinks of as today). */
export const today = () => new Date().toLocaleDateString('en-CA')
export function addDays(date: string, n: number) {
  const d = toDate(date)
  d.setUTCDate(d.getUTCDate() + n)
  return fmtDate(d)
}
/** Adds months, clamping the day to the target month's length (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: string, n: number) {
  const d = toDate(date)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + n)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return fmtDate(d)
}
export const addMonth = (month: string, n: number) => addMonths(`${month}-01`, n).slice(0, 7)
export const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000)
export const round2 = (n: number) => Math.round(n * 100) / 100
