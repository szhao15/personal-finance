// Pure helpers for filtering and charting. All money math is done in integer cents,
// so totals are exact; values are converted to dollars only for chart axes.
import type { Transaction } from "./api";

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

/** Category filter: nothing selected keeps everything; otherwise only spending in those categories. */
export function filterByCategories(txns: Transaction[], selected: string[]) {
  if (selected.length === 0) return txns;
  return txns.filter((t) => !t.is_transfer && selected.includes(categoryOf(t)));
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

/** Count and spending per category, including categories with nothing in range. */
export function categoryStats(txns: Transaction[], allCategories: string[]) {
  const stats = new Map<string, { count: number; cents: number }>(allCategories.map((c) => [c, { count: 0, cents: 0 }]));
  for (const t of txns) {
    if (t.is_transfer) continue;
    const s = stats.get(categoryOf(t)) ?? { count: 0, cents: 0 };
    stats.set(categoryOf(t), { count: s.count + 1, cents: s.cents - cents(t.amount) });
  }
  return [...stats].map(([name, s]) => ({ name, ...s })).sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
}

/** Monthly spending stacked by the top categories; the rest are grouped as "Other". */
export function monthlyByCategory(txns: Transaction[], maxSeries = 5) {
  const top = spendBy(txns, categoryOf).slice(0, maxSeries).map((t) => t.name);
  const spending = txns.filter((t) => !t.is_transfer);
  const hasOther = spending.some((t) => !top.includes(categoryOf(t)));
  const series = hasOther ? [...top, "Other"] : top;
  if (spending.length === 0) return { series, data: [] };

  const months = spending.map((t) => t.date.slice(0, 7)).sort();
  const buckets = new Map<string, Map<string, number>>();
  for (let m = months[months.length - 1]; m >= months[0]; m = prevMonth(m)) buckets.set(m, new Map());
  for (const t of spending) {
    const bucket = buckets.get(t.date.slice(0, 7))!;
    const name = top.includes(categoryOf(t)) ? categoryOf(t) : "Other";
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
