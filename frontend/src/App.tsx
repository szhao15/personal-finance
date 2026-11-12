import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  UNCATEGORIZED,
  categoryOf,
  categoryStats,
  filterByCategories,
  formatCents,
  formatDate,
  isoDate,
  monthlyByCategory,
  parentMap,
  presetRange,
  prevMonth,
  sortRows,
  spendBy,
  spendingPace,
  topCategoryOf,
  totalSpent,
  type Preset,
  type Range,
  type SortDir,
  type SortKey,
} from "./analytics";
import { api, money, type Account, type Category, type ImportRecord, type Preview, type Rule, type Transaction } from "./api";
import { CategoryManager } from "./CategoryManager";
import { CategoryChart, MerchantChart, PaceChart, TrendChart, categoryColors } from "./Charts";
import { CategoryFilter, FilterBar } from "./Filters";

type Status = { kind: "error" | "info"; text: string } | null;

// Set by docker-compose: "prod" when started with ./prod, otherwise the dev copy.
const isProd = import.meta.env.VITE_APP_ENV === "prod";
if (!isProd) document.title = "DEV · Personal Finance";

export default function App() {
  // Import
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [importAccountId, setImportAccountId] = useState<number | null>(null);
  const [newAccount, setNewAccount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [rule, setRule] = useState({ match_text: "", category: "" });
  const [rules, setRules] = useState<Rule[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Filters (empty account or category list = all)
  const [accountIds, setAccountIds] = useState<number[]>([]);
  const [preset, setPreset] = useState<Preset>("3-months");
  const [custom, setCustom] = useState<Range>(() => presetRange("3-months"));
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showSubcategories, setShowSubcategories] = useState(false);

  // Data
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [paceTransactions, setPaceTransactions] = useState<Transaction[]>([]);

  const range = useMemo(() => (preset === "custom" ? custom : presetRange(preset)), [preset, custom]);
  const rangeError = range.start && range.end && range.start > range.end ? "The start date must be on or before the end date." : null;
  const paceEnd = range.end ?? isoDate(new Date());

  const run = async (action: () => Promise<void>) => {
    try {
      setStatus(null);
      await action();
    } catch (e) {
      setStatus({ kind: "error", text: (e as Error).message });
    }
  };

  const loadAccounts = async () => {
    const list = await api.accounts();
    setAccounts(list);
    setImportAccountId((id) => id ?? list[0]?.id ?? null);
  };

  const loadData = useCallback(async () => {
    const [txns, pace, categories, importList, ruleList] = await Promise.all([
      rangeError ? Promise.resolve([]) : api.transactions({ ...range, accountIds }),
      // The pace chart compares the range's last month with the month before it.
      api.transactions({ start: `${prevMonth(paceEnd.slice(0, 7))}-01`, end: paceEnd, accountIds }),
      api.categories(),
      api.imports(),
      api.rules(),
    ]);
    setTransactions(txns);
    setPaceTransactions(pace);
    setAllCategories(categories);
    setImports(importList);
    setRules(ruleList);
  }, [range, rangeError, accountIds, paceEnd]);

  useEffect(() => {
    run(loadAccounts);
  }, []);

  useEffect(() => {
    run(loadData);
  }, [loadData]);

  const choosePreset = (next: Preset) => {
    // Start a custom range from whatever range is showing now.
    if (next === "custom") setCustom(range.start || range.end ? range : presetRange("3-months"));
    setPreset(next);
  };

  const addAccount = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const account = await api.createAccount(newAccount.trim());
      setNewAccount("");
      setImportAccountId(account.id);
      await loadAccounts();
    });
  };

  const showPreview = (e: FormEvent) => {
    e.preventDefault();
    if (!file || importAccountId === null) return;
    run(async () => setPreview(await api.preview(importAccountId, file)));
  };

  const confirmImport = () => {
    if (!file || importAccountId === null) return;
    run(async () => {
      const result = await api.commit(importAccountId, file);
      setPreview(null);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await Promise.all([loadAccounts(), loadData()]);
      setStatus({ kind: "info", text: `Imported ${result.inserted} transactions, skipped ${result.skipped} duplicates.` });
    });
  };

  const changeCategory = (t: Row, category: string | null) => {
    // Offer to apply the change to the merchant's other transactions (all dates and accounts).
    const others = transactions.filter((o) => o.merchant_key === t.merchant_key && o.id !== t.id && !o.is_transfer).length;
    const applyToMerchant =
      others > 0 &&
      window.confirm(
        `Also change every other transaction from ${t.merchant} to ${category ?? UNCATEGORIZED}?\n\n` +
          `OK: all from this merchant (at least ${others} more, across all dates and accounts)\nCancel: only this one`,
      );
    run(async () => {
      const result = await api.setCategory(t.id, category, applyToMerchant);
      await loadData();
      if (result.updated > 1) setStatus({ kind: "info", text: `Changed ${result.updated} transactions from ${t.merchant}.` });
    });
  };

  const createCategory = (name: string, parent: string | null) =>
    run(async () => {
      await api.createCategory(name, parent);
      await loadData();
      setStatus({ kind: "info", text: parent ? `Added ${name} inside ${parent}.` : `Added ${name}.` });
    });

  const renameCategory = (c: Category, name: string) =>
    run(async () => {
      await api.renameCategory(c.id, name);
      setSelectedCategories((sel) => sel.map((s) => (s === c.name ? name : s)));
      await loadData();
    });

  const deleteCategory = (c: Category) =>
    run(async () => {
      const result = await api.deleteCategory(c.id);
      setSelectedCategories((sel) => sel.filter((s) => s !== c.name));
      await loadData();
      setStatus({
        kind: "info",
        text: `Deleted ${c.name}. ${result.moved} transactions moved to ${c.parent ?? UNCATEGORIZED}.`,
      });
    });

  const undoImport = (imp: ImportRecord) => {
    if (!window.confirm(`Undo import of ${imp.filename}? Its ${imp.row_count} transactions will be removed.`)) return;
    run(async () => {
      await api.undoImport(imp.id);
      await loadData();
    });
  };

  const addRule = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api.createRule(rule.match_text.trim(), rule.category.trim());
      setRule({ match_text: "", category: "" });
      await loadData();
      setStatus({ kind: "info", text: "Rule saved and applied to matching transactions." });
    });
  };

  const deleteRule = (r: Rule) => {
    if (!window.confirm(`Delete the rule "${r.match_text}" → ${r.category}?`)) return;
    run(async () => {
      await api.deleteRule(r.id);
      await loadData();
      setStatus({
        kind: "info",
        text: "Rule deleted. Future imports won't use it; transactions it already categorized keep their category.",
      });
    });
  };

  // Everything below the filters is derived from the loaded transactions.
  const categoryNames = useMemo(() => allCategories.map((c) => c.name), [allCategories]);
  const parents = useMemo(() => parentMap(allCategories), [allCategories]);
  // Charts group by top-level category (Movies counts as Entertainment) unless subcategories are shown.
  const chartKey = useMemo(() => (showSubcategories ? categoryOf : topCategoryOf(parents)), [showSubcategories, parents]);
  const visible = useMemo(
    () => filterByCategories(transactions, selectedCategories, parents),
    [transactions, selectedCategories, parents],
  );
  const stats = useMemo(() => categoryStats(transactions, allCategories), [transactions, allCategories]);
  const colorOf = useMemo(() => categoryColors([...categoryNames, UNCATEGORIZED]), [categoryNames]);
  const byCategory = useMemo(() => spendBy(visible, chartKey), [visible, chartKey]);
  const merchants = useMemo(() => spendBy(visible, (t) => t.merchant).slice(0, 10), [visible]);
  const trend = useMemo(() => monthlyByCategory(visible, chartKey), [visible, chartKey]);
  const pace = useMemo(
    () => spendingPace(filterByCategories(paceTransactions, selectedCategories, parents), paceEnd),
    [paceTransactions, selectedCategories, parents, paceEnd],
  );
  const hasPace = pace.data.some((d) => (d.current ?? 0) > 0 || (d.previous ?? 0) > 0);
  const newRows = preview?.rows.filter((r) => !r.duplicate).length ?? 0;

  return (
    <main>
      <div className="row spread">
        <h1>Personal Finance</h1>
        {!isProd && <span className="env-badge">Development · fake data only</span>}
      </div>
      {status && (
        <p className={`status ${status.kind}`} role={status.kind === "error" ? "alert" : "status"}>
          {status.text}
        </p>
      )}

      <section>
        <h2>Filters</h2>
        <FilterBar
          accounts={accounts}
          accountIds={accountIds}
          onAccountsChange={setAccountIds}
          preset={preset}
          onPresetChange={choosePreset}
          custom={custom}
          onCustomChange={setCustom}
        />
        {rangeError && (
          <p className="status error" role="alert">
            {rangeError}
          </p>
        )}
        <div className="row spread">
          <h3>Categories</h3>
          <label className="check">
            <input type="checkbox" checked={showSubcategories} onChange={(e) => setShowSubcategories(e.target.checked)} />
            Show subcategories separately in charts
          </label>
        </div>
        <CategoryFilter stats={stats} selected={selectedCategories} onChange={setSelectedCategories} colorOf={colorOf} />
      </section>

      <section>
        <div className="stats">
          <div>
            <span className="muted">Total spent</span>
            <strong>{formatCents(totalSpent(visible))}</strong>
          </div>
          <div>
            <span className="muted">Transactions</span>
            <strong>{visible.length}</strong>
          </div>
          <div>
            <span className="muted">Range</span>
            <strong>
              {range.start || range.end
                ? `${range.start ? formatDate(range.start) : "start"} → ${range.end ? formatDate(range.end) : "today"}`
                : "All time"}
            </strong>
          </div>
        </div>
      </section>

      <div className="charts">
        <ChartCard title="Spending by category" empty={byCategory.length === 0}>
          <CategoryChart totals={byCategory} colorOf={colorOf} />
        </ChartCard>
        <ChartCard title="Top merchants" empty={merchants.length === 0}>
          <MerchantChart totals={merchants} />
        </ChartCard>
        <ChartCard title="Spending over time" empty={trend.data.length === 0}>
          <TrendChart series={trend.series} data={trend.data} colorOf={colorOf} />
        </ChartCard>
        <ChartCard title={`Spending pace: ${pace.currentLabel} vs. ${pace.previousLabel}`} empty={!hasPace}>
          <PaceChart {...pace} />
        </ChartCard>
      </div>

      <section>
        <details className="collapsible" open>
          <summary>
            <h2>Transactions ({visible.length})</h2>
          </summary>
          <p className="muted">
            Change a category to fix it. Future imports from the same merchant will use your choice. Tip: filter by Uncategorized to review what still needs one.
          </p>
          {visible.length === 0 ? (
            <p className="muted">No transactions match these filters.</p>
          ) : (
            <TransactionTable rows={visible} showAccount categories={allCategories} onCategoryChange={changeCategory} />
          )}
        </details>
      </section>

      <section>
        <h2>Import a statement</h2>
        <div className="row">
          <label>
            Account{" "}
            <select value={importAccountId ?? ""} onChange={(e) => setImportAccountId(Number(e.target.value))}>
              {accounts.length === 0 && <option value="">No accounts yet</option>}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.last4 ? ` ••${a.last4}` : ""}
                </option>
              ))}
            </select>
          </label>
          <form onSubmit={addAccount} className="row">
            <label>
              New account <input value={newAccount} onChange={(e) => setNewAccount(e.target.value)} />
            </label>
            <button disabled={!newAccount.trim()}>Add</button>
          </form>
        </div>
        <form onSubmit={showPreview} className="row">
          <label>
            Statement CSV (Chase, Citi or Bilt){" "}
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
              }}
            />
          </label>
          <button disabled={!file || importAccountId === null}>Preview</button>
        </form>

        {preview && (
          <div className="preview">
            {preview.warning && <p className="status error">{preview.warning}</p>}
            {preview.already_imported && <p className="status error">This exact file was already imported.</p>}
            <p>
              {preview.bank} statement{preview.last4 ? ` (card ••${preview.last4})` : ""}: {preview.rows.length} rows found, {newRows} new.
            </p>
            <TransactionTable
              rows={preview.rows.map((r, i) => ({ ...r, id: i, account: "" }))}
              flag={(r) => (preview.rows[r.id].duplicate ? "Duplicate" : "New")}
            />
            <div className="row">
              <button onClick={confirmImport} disabled={newRows === 0}>
                Import {newRows} transactions
              </button>
              <button className="secondary" onClick={() => setPreview(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2>Categories</h2>
        <p className="muted">
          Add your own categories, or subcategories to be more specific (e.g. Movies inside Entertainment). A parent's totals
          include its subcategories.
        </p>
        <CategoryManager categories={allCategories} onCreate={createCategory} onRename={renameCategory} onDelete={deleteCategory} />
      </section>

      <section>
        <h2>Category rules</h2>
        <p className="muted">Transactions whose description contains the text get this category, overriding the bank's.</p>
        <form onSubmit={addRule} className="row">
          <label>
            Description contains{" "}
            <input value={rule.match_text} onChange={(e) => setRule({ ...rule, match_text: e.target.value })} />
          </label>
          <label>
            Category{" "}
            <input
              value={rule.category}
              onChange={(e) => setRule({ ...rule, category: e.target.value })}
              list="category-names"
            />
            <datalist id="category-names">
              {categoryNames.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <button disabled={!rule.match_text.trim() || !rule.category.trim()}>Add rule</button>
        </form>
        {rules.length === 0 ? (
          <p className="muted">No rules yet.</p>
        ) : (
          <ul className="imports">
            {rules.map((r) => (
              <li key={r.id}>
                <span>
                  Description contains <strong>{r.match_text}</strong> → {r.category}
                </span>
                <button className="secondary" onClick={() => deleteRule(r)} aria-label={`Delete rule ${r.match_text}`}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Import history</h2>
        {imports.length === 0 ? (
          <p className="muted">Nothing imported yet.</p>
        ) : (
          <ul className="imports">
            {imports.map((imp) => (
              <li key={imp.id}>
                <span>
                  {imp.filename} · {imp.account} · {imp.row_count} rows ·{" "}
                  {new Date(imp.imported_at).toLocaleString("en-US", {
                    month: "2-digit",
                    day: "2-digit",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <button className="secondary" onClick={() => undoImport(imp)}>
                  Undo
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ChartCard({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  return (
    <section className="chart-card">
      <h2>{title}</h2>
      {empty ? <p className="muted">No spending for these filters.</p> : children}
    </section>
  );
}

type Row = Pick<Transaction, "id" | "date" | "merchant" | "amount" | "category" | "is_transfer" | "account"> &
  Partial<Pick<Transaction, "merchant_key">>;

const NEW_CATEGORY = "__new__";

function CategorySelect({ row, categories, onChange }: { row: Row; categories: Category[]; onChange: (row: Row, category: string | null) => void }) {
  const choose = (value: string) => {
    if (value !== NEW_CATEGORY) return onChange(row, value || null);
    const name = window.prompt("New category name")?.trim();
    if (name) onChange(row, name);
  };
  return (
    <select aria-label={`Category for ${row.merchant} on ${formatDate(row.date)}`} value={row.category ?? ""} onChange={(e) => choose(e.target.value)}>
      <option value="">{UNCATEGORIZED}</option>
      {/* Categories arrive parents-first, so each subcategory sits indented under its parent. */}
      {categories.map((c) => (
        <option key={c.id} value={c.name}>
          {c.parent ? `   ↳ ${c.name}` : c.name}
        </option>
      ))}
      <option value={NEW_CATEGORY}>New category…</option>
    </select>
  );
}

function TransactionTable({
  rows,
  flag,
  showAccount,
  categories = [],
  onCategoryChange,
}: {
  rows: Row[];
  flag?: (row: Row) => string;
  showAccount?: boolean;
  categories?: Category[];
  onCategoryChange?: (row: Row, category: string | null) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "date", dir: "desc" });
  const sorted = useMemo(() => sortRows(rows, sort.key, sort.dir), [rows, sort]);

  const categoryCell = (r: Row) => {
    if (r.is_transfer) return <span className="muted">Transfer</span>;
    if (onCategoryChange) return <CategorySelect row={r} categories={categories} onChange={onCategoryChange} />;
    return r.category ?? UNCATEGORIZED;
  };

  // Click a heading to sort by it; click again to reverse. Dates start newest first,
  // amounts largest spending first, text A to Z.
  const header = (key: SortKey, label: string, className?: string) => {
    const active = sort.key === key;
    const next: SortDir = active ? (sort.dir === "asc" ? "desc" : "asc") : key === "date" ? "desc" : "asc";
    return (
      <th className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" className="sort" onClick={() => setSort({ key, dir: next })}>
          {label}
          <span aria-hidden className={active ? "sort-arrow active" : "sort-arrow"}>
            {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </button>
      </th>
    );
  };

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {header("date", "Date")}
            {header("merchant", "Description")}
            {showAccount && header("account", "Account")}
            {header("category", "Category")}
            {header("amount", "Amount", "num")}
            {flag && <th>Status</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id}>
              <td>{formatDate(r.date)}</td>
              <td>{r.merchant}</td>
              {showAccount && <td>{r.account}</td>}
              <td>{categoryCell(r)}</td>
              <td className={`num ${Number(r.amount) > 0 ? "credit" : ""}`}>{money(r.amount)}</td>
              {flag && <td>{flag(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
