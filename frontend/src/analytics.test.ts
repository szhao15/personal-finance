import { describe, expect, it } from "vitest";
import type { Transaction } from "./api";
import {
  categoryStats,
  filterByCategories,
  formatDate,
  monthlyByCategory,
  parentMap,
  presetRange,
  topCategoryOf,
  prevMonth,
  sortRows,
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
  merchant_key: merchant,
});
const cat = (name: string, parent: string | null = null) => ({ id: id++, name, parent });

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
    const stats = categoryStats(sample, [cat("Food"), cat("Shopping"), cat("Travel")]);
    expect(stats.find((s) => s.name === "Travel")).toEqual({ name: "Travel", parent: null, count: 0, cents: 0 });
    expect(stats.find((s) => s.name === "Food")).toEqual({ name: "Food", parent: null, count: 2, cents: 30 });
  });
  it("category filter keeps only spending in selected categories", () => {
    expect(filterByCategories(sample, [])).toHaveLength(sample.length);
    expect(filterByCategories(sample, ["Food"]).map((t) => t.amount)).toEqual(["-0.10", "-0.20"]);
  });
});

describe("subcategories", () => {
  const categories = [cat("Entertainment"), cat("Movies", "Entertainment"), cat("Concerts", "Entertainment"), cat("Food")];
  const parents = parentMap(categories);
  const txns = [
    tx("2026-10-01", "-85.00", "Movies"),
    tx("2026-10-02", "-125.00", "Entertainment"),
    tx("2026-10-03", "-40.00", "Food"),
  ];
  it("rolls subcategories into their parent's totals, listed right after it", () => {
    expect(categoryStats(txns, categories)).toEqual([
      { name: "Entertainment", parent: null, count: 2, cents: 21000 },
      { name: "Movies", parent: "Entertainment", count: 1, cents: 8500 },
      { name: "Concerts", parent: "Entertainment", count: 0, cents: 0 },
      { name: "Food", parent: null, count: 1, cents: 4000 },
    ]);
    expect(spendBy(txns, topCategoryOf(parents))).toEqual([
      { name: "Entertainment", cents: 21000 },
      { name: "Food", cents: 4000 },
    ]);
  });
  it("filtering a parent includes its subcategories; filtering a subcategory does not include the parent", () => {
    expect(filterByCategories(txns, ["Entertainment"], parents).map((t) => t.category)).toEqual(["Movies", "Entertainment"]);
    expect(filterByCategories(txns, ["Movies"], parents).map((t) => t.category)).toEqual(["Movies"]);
  });
});

describe("charts", () => {
  it("groups monthly spending with an Other bucket and fills empty months", () => {
    const txns = [...sample, tx("2026-08-15", "-5.00", "Travel")];
    const { series, data } = monthlyByCategory(txns, categoryOf, 2);
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

describe("formatDate", () => {
  it("shows month/day/year", () => {
    expect(formatDate("2026-11-08")).toBe("11/08/2026");
    expect(formatDate("2026-01-01")).toBe("01/01/2026"); // no time-zone shift to Dec 31
  });
});

describe("sortRows", () => {
  const rows = [
    tx("2026-10-02", "-5.00", "food", "banana stand"),
    tx("2026-10-09", "20.00", "Shopping", "Apple Store"),
    tx("2026-10-05", "-50.00", null, "Cafe 10"),
    tx("2026-10-01", "500.00", null, "Payment", true),
  ];
  const merchants = (r: Transaction[]) => r.map((t) => t.merchant);
  it("sorts dates both ways", () => {
    expect(merchants(sortRows(rows, "date", "desc"))).toEqual(["Apple Store", "Cafe 10", "banana stand", "Payment"]);
    expect(merchants(sortRows(rows, "date", "asc"))).toEqual(["Payment", "banana stand", "Cafe 10", "Apple Store"]);
  });
  it("sorts amounts by signed value: ascending puts the largest spending first", () => {
    expect(sortRows(rows, "amount", "asc").map((t) => t.amount)).toEqual(["-50.00", "-5.00", "20.00", "500.00"]);
  });
  it("sorts text ignoring case, with transfers labeled Transfer", () => {
    expect(merchants(sortRows(rows, "merchant", "asc"))).toEqual(["Apple Store", "banana stand", "Cafe 10", "Payment"]);
    expect(sortRows(rows, "category", "asc").map((t) => (t.is_transfer ? "Transfer" : t.category))).toEqual([
      "food",
      "Shopping",
      "Transfer",
      null, // Uncategorized
    ]);
  });
  it("does not change the original list", () => {
    sortRows(rows, "amount", "asc");
    expect(merchants(rows)).toEqual(["banana stand", "Apple Store", "Cafe 10", "Payment"]);
  });
});
