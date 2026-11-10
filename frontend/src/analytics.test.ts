import { describe, expect, it } from "vitest";
import type { Transaction } from "./api";
import {
  categoryStats,
  filterByCategories,
  monthlyByCategory,
  presetRange,
  prevMonth,
  spendBy,
  spendingPace,
  totalSpent,
  categoryOf,
} from "./analytics";

let id = 0;
const tx = (date: string, amount: string, category: string | null, merchant = "SHOP", is_transfer = false): Transaction => ({
  id: id++,
  date,
  merchant,
  amount,
  category,
  is_transfer,
  account: "Card",
});

const sample = [
  tx("2026-10-02", "-0.10", "Food"),
  tx("2026-10-03", "-0.20", "Food"),
  tx("2026-10-05", "-50.00", "Shopping", "OUTFITTERS"),
  tx("2026-10-09", "20.00", "Shopping", "OUTFITTERS"), // refund
  tx("2026-10-10", "500.00", null, "PAYMENT", true), // card payment
  tx("2026-11-01", "-7.00", null),
];

describe("date ranges", () => {
  const today = new Date(2026, 0, 15); // Jan 15 2026, to cross a year boundary
  it("computes presets", () => {
    expect(presetRange("this-month", today)).toEqual({ start: "2026-01-01", end: "2026-01-15" });
    expect(presetRange("last-month", today)).toEqual({ start: "2025-12-01", end: "2025-12-31" });
    expect(presetRange("3-months", today)).toEqual({ start: "2025-11-01", end: "2026-01-15" });
    expect(presetRange("all", today)).toEqual({ start: null, end: null });
  });
  it("steps back a month across a year", () => {
    expect(prevMonth("2026-01")).toBe("2025-12");
    expect(prevMonth("2026-11")).toBe("2026-10");
  });
});

describe("totals", () => {
  it("sums exactly in cents, excludes transfers, nets refunds", () => {
    expect(totalSpent(sample)).toBe(3730); // 0.10 + 0.20 + 50 - 20 + 7
    expect(spendBy(sample, categoryOf)).toEqual([
      { name: "Shopping", cents: 3000 },
      { name: "Uncategorized", cents: 700 },
      { name: "Food", cents: 30 },
    ]);
  });
  it("lists every category with counts, even empty ones", () => {
    const stats = categoryStats(sample, ["Food", "Shopping", "Travel"]);
    expect(stats.find((s) => s.name === "Travel")).toEqual({ name: "Travel", count: 0, cents: 0 });
    expect(stats.find((s) => s.name === "Food")).toEqual({ name: "Food", count: 2, cents: 30 });
  });
  it("category filter keeps only spending in selected categories", () => {
    expect(filterByCategories(sample, [])).toHaveLength(sample.length);
    expect(filterByCategories(sample, ["Food"]).map((t) => t.amount)).toEqual(["-0.10", "-0.20"]);
  });
});

describe("charts", () => {
  it("groups monthly spending with an Other bucket and fills empty months", () => {
    const txns = [...sample, tx("2026-08-15", "-5.00", "Travel")];
    const { series, data } = monthlyByCategory(txns, 2);
    expect(series).toEqual(["Shopping", "Uncategorized", "Other"]);
    expect(data.map((d) => d.month)).toEqual(["Aug 2026", "Sep 2026", "Oct 2026", "Nov 2026"]);
    expect(data[1]).toEqual({ month: "Sep 2026", Shopping: 0, Uncategorized: 0, Other: 0 });
    expect(data[2]).toMatchObject({ Shopping: 30, Other: 0.3 });
  });
  it("builds cumulative pace for this month vs last", () => {
    const { data, currentLabel, previousLabel } = spendingPace(sample, "2026-11-03");
    expect([currentLabel, previousLabel]).toEqual(["Nov 2026", "Oct 2026"]);
    expect(data[0]).toEqual({ day: 1, current: 7, previous: 0 });
    expect(data[2].current).toBe(7);
    expect(data[3].current).toBeNull(); // future days in the current month are empty
    expect(data[30].previous).toBe(30.3);
  });
});
