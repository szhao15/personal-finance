// Pure helpers for filtering and charting. All money math is done in integer cents,
// so totals are exact; values are converted to dollars only for chart axes.
import type { Category, Transaction } from "./api";

export type Preset = "this-month" | "last-month" | "3-months" | "ytd" | "12-months" | "all" | "custom";
export type Range = { start: string | null; end: string | null };
export type Total = { name: string; cents: number };

export const PRESETS: { value: Preset; label: string }[] = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "3-months", label: "Last 3 months" },
  { value: "ytd", label: "Year to date" },
  { value: "12-months", label: "Last 12 months" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

export const UNCATEGORIZED = "Uncategorized";

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "2026-11-08" -> "11/08/2026". Works on the text, so time zones can't shift the day. */
export const formatDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
};

export function presetRange(preset: Exclude<Preset, "custom">, today = new Date()): Range {
  const y = today.getFullYear();
  const m = today.getMonth();
  const end = isoDate(today);
  switch (preset) {
    case "this-month":
      return { start: isoDate(new Date(y, m, 1)), end };
    case "last-month":
      return { start: isoDate(new Date(y, m - 1, 1)), end: isoDate(new Date(y, m, 0)) };
    case "3-months":
      return { start: isoDate(new Date(y, m - 2, 1)), end };
    case "ytd":
      return { start: isoDate(new Date(y, 0, 1)), end };
    case "12-months":
      return { start: isoDate(new Date(y, m - 11, 1)), end };
    case "all":
      return { start: null, end: null };
  }
}

/** "2026-11" -> "2026-10" */
export function prevMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

const daysInMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

export const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
};

export const cents = (amount: string) => Math.round(Number(amount) * 100);
export const formatCents = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
export const categoryOf = (t: Transaction) => t.category ?? UNCATEGORIZED;

export type SortKey = "date" | "merchant" | "account" | "category" | "amount";
export type SortDir = "asc" | "desc";
type SortableRow = Pick<Transaction, "id" | "date" | "merchant" | "account" | "category" | "is_transfer" | "amount">;

const sortValue = (t: SortableRow, key: SortKey): string | number => {
  if (key === "amount") return cents(t.amount);
  if (key === "category") return t.is_transfer ? "Transfer" : (t.category ?? UNCATEGORIZED);
  return t[key];
};

/** Sorted copy of the rows. Amounts sort by signed value (ascending = largest spending first);
 *  text ignores case. Ties fall back to newest first. */
export function sortRows<T extends SortableRow>(rows: T[], key: SortKey, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    const order =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y), "en-US", { sensitivity: "base", numeric: true });
    return order * sign || b.date.localeCompare(a.date) || b.id - a.id;
  });
}

/** Subcategory name -> parent name (e.g. "Movies" -> "Entertainment"). */
export type Parents = Map<string, string>;
export const parentMap = (categories: Category[]): Parents =>
  new Map(categories.flatMap((c) => (c.parent ? [[c.name, c.parent] as const] : [])));

/** Key that rolls a subcategory up into its parent: Movies -> Entertainment. */
export const topCategoryOf = (parents: Parents) => (t: Transaction) => {
  const name = categoryOf(t);
  return parents.get(name) ?? name;
};

/** Category filter: nothing selected keeps everything; otherwise only spending in those categories.
 *  Selecting a parent also includes its subcategories. */
export function filterByCategories(txns: Transaction[], selected: string[], parents: Parents = new Map()) {
  if (selected.length === 0) return txns;
  return txns.filter((t) => {
    if (t.is_transfer) return false;
    const name = categoryOf(t);
    return selected.includes(name) || selected.includes(parents.get(name) ?? "");
  });
}

/** Spending (positive cents) grouped by key, largest first. Transfers excluded; refunds reduce spending. */
export function spendBy(txns: Transaction[], key: (t: Transaction) => string): Total[] {
  const totals = new Map<string, number>();
  for (const t of txns) {
    if (t.is_transfer) continue;
    totals.set(key(t), (totals.get(key(t)) ?? 0) - cents(t.amount));
  }
  return [...totals]
    .map(([name, c]) => ({ name, cents: c }))
    .filter((t) => t.cents > 0)
    .sort((a, b) => b.cents - a.cents);
}

export const totalSpent = (txns: Transaction[]) =>
  txns.reduce((sum, t) => (t.is_transfer ? sum : sum - cents(t.amount)), 0);

export type CategoryStat = { name: string; parent: string | null; count: number; cents: number };

/** Count and spending per category, including categories with nothing in range. Parents come first
 *  (largest spending first), each followed by its subcategories; a parent's totals include them. */
export function categoryStats(txns: Transaction[], categories: Category[]): CategoryStat[] {
  const own = new Map<string, { count: number; cents: number }>();
  for (const t of txns) {
    if (t.is_transfer) continue;
    const s = own.get(categoryOf(t)) ?? { count: 0, cents: 0 };
    own.set(categoryOf(t), { count: s.count + 1, cents: s.cents - cents(t.amount) });
  }
  const parents = parentMap(categories);
  const names = [...new Set([...categories.map((c) => c.name), ...own.keys()])];
  const stat = (name: string) => own.get(name) ?? { count: 0, cents: 0 };
  const largestFirst = (a: CategoryStat, b: CategoryStat) => b.cents - a.cents || a.name.localeCompare(b.name);

  const groups = names
    .filter((name) => !parents.has(name))
    .map((name) => {
      const subs = names
        .filter((sub) => parents.get(sub) === name)
        .map((sub) => ({ name: sub, parent: name, ...stat(sub) }))
        .sort(largestFirst);
      const total = subs.reduce((sum, s) => ({ count: sum.count + s.count, cents: sum.cents + s.cents }), stat(name));
      return { top: { name, parent: null, ...total }, subs };
    })
    .sort((a, b) => largestFirst(a.top, b.top));
  return groups.flatMap((g) => [g.top, ...g.subs]);
}

/** Monthly spending stacked by the top categories; the rest are grouped as "Other". */
export function monthlyByCategory(txns: Transaction[], key: (t: Transaction) => string = categoryOf, maxSeries = 5) {
  const top = spendBy(txns, key).slice(0, maxSeries).map((t) => t.name);
  const spending = txns.filter((t) => !t.is_transfer);
  const hasOther = spending.some((t) => !top.includes(key(t)));
  const series = hasOther ? [...top, "Other"] : top;
  if (spending.length === 0) return { series, data: [] };

  const months = spending.map((t) => t.date.slice(0, 7)).sort();
  const buckets = new Map<string, Map<string, number>>();
  for (let m = months[months.length - 1]; m >= months[0]; m = prevMonth(m)) buckets.set(m, new Map());
  for (const t of spending) {
    const bucket = buckets.get(t.date.slice(0, 7))!;
    const name = top.includes(key(t)) ? key(t) : "Other";
    bucket.set(name, (bucket.get(name) ?? 0) - cents(t.amount));
  }
  const data = [...buckets]
    .reverse()
    .map(([month, b]) => ({ month: monthLabel(month), ...Object.fromEntries(series.map((s) => [s, (b.get(s) ?? 0) / 100])) }));
  return { series, data };
}

/** Cumulative spending by day of month: the month containing `endDate` (up to that day) vs. the month before. */
export function spendingPace(txns: Transaction[], endDate: string) {
  const current = endDate.slice(0, 7);
  const previous = prevMonth(current);
  const cumulative = (month: string, lastDay: number) => {
    const daily = new Array(lastDay).fill(0);
    for (const t of txns) {
      if (t.is_transfer || !t.date.startsWith(month)) continue;
      const day = Number(t.date.slice(8, 10));
      if (day <= lastDay) daily[day - 1] -= cents(t.amount);
    }
    let running = 0;
    return daily.map((c) => (running += c));
  };
  const cur = cumulative(current, Number(endDate.slice(8, 10)));
  const prev = cumulative(previous, daysInMonth(previous));
  const days = Math.max(daysInMonth(current), prev.length);
  const data = Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    current: i < cur.length ? cur[i] / 100 : null,
    previous: i < prev.length ? prev[i] / 100 : null,
  }));
  return { data, currentLabel: monthLabel(current), previousLabel: monthLabel(previous) };
}
