import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  api,
  money,
  type Account,
  type CategoryTotal,
  type ImportRecord,
  type Preview,
  type Transaction,
} from "./api";

type Status = { kind: "error" | "info"; text: string } | null;

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [newAccount, setNewAccount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [month, setMonth] = useState(currentMonth);
  const [summary, setSummary] = useState<CategoryTotal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [rule, setRule] = useState({ match_text: "", category: "" });
  const [status, setStatus] = useState<Status>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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
    setAccountId((id) => id ?? list[0]?.id ?? null);
  };

  const loadMonth = useCallback(async (m: string) => {
    const [s, t, i] = await Promise.all([api.summary(m), api.transactions(m), api.imports()]);
    setSummary(s);
    setTransactions(t);
    setImports(i);
  }, []);

  useEffect(() => {
    run(loadAccounts);
  }, []);

  useEffect(() => {
    run(() => loadMonth(month));
  }, [month, loadMonth]);

  const addAccount = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const account = await api.createAccount(newAccount.trim());
      setNewAccount("");
      setAccountId(account.id);
      await loadAccounts();
    });
  };

  const showPreview = (e: FormEvent) => {
    e.preventDefault();
    if (!file || accountId === null) return;
    run(async () => setPreview(await api.preview(accountId, file)));
  };

  const confirmImport = () => {
    if (!file || accountId === null) return;
    run(async () => {
      const result = await api.commit(accountId, file);
      setPreview(null);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await Promise.all([loadAccounts(), loadMonth(month)]);
      setStatus({ kind: "info", text: `Imported ${result.inserted} transactions, skipped ${result.skipped} duplicates.` });
    });
  };

  const undoImport = (imp: ImportRecord) => {
    if (!window.confirm(`Undo import of ${imp.filename}? Its ${imp.row_count} transactions will be removed.`)) return;
    run(async () => {
      await api.undoImport(imp.id);
      await loadMonth(month);
    });
  };

  const addRule = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api.createRule(rule.match_text.trim(), rule.category.trim());
      setRule({ match_text: "", category: "" });
      await loadMonth(month);
      setStatus({ kind: "info", text: "Rule saved and applied to matching transactions." });
    });
  };

  const newRows = preview?.rows.filter((r) => !r.duplicate).length ?? 0;
  const chartData = summary.map((c) => ({ category: c.category, total: Number(c.total) }));
  const totalSpent = summary.reduce((sum, c) => sum + Number(c.total), 0);

  return (
    <main>
      <h1>Personal Finance</h1>
      {status && (
        <p className={`status ${status.kind}`} role={status.kind === "error" ? "alert" : "status"}>
          {status.text}
        </p>
      )}

      <section>
        <h2>Import a statement</h2>
        <div className="row">
          <label>
            Account{" "}
            <select value={accountId ?? ""} onChange={(e) => setAccountId(Number(e.target.value))}>
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
              New account <input value={newAccount} onChange={(e) => setNewAccount(e.target.value)} placeholder="Chase Sapphire" />
            </label>
            <button disabled={!newAccount.trim()}>Add</button>
          </form>
        </div>
        <form onSubmit={showPreview} className="row">
          <label>
            Chase CSV{" "}
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
          <button disabled={!file || accountId === null}>Preview</button>
        </form>

        {preview && (
          <div className="preview">
            {preview.already_imported && <p className="status error">This exact file was already imported.</p>}
            <p>
              {preview.rows.length} rows found, {newRows} new.
            </p>
            <TransactionTable
              rows={preview.rows.map((r, i) => ({ ...r, id: i, account: "" }))}
              flag={(i) => (preview.rows[i].duplicate ? "Duplicate" : "New")}
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
        <div className="row spread">
          <h2>Spending</h2>
          <label>
            Month <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </label>
        </div>
        {summary.length === 0 ? (
          <p className="muted">No spending this month.</p>
        ) : (
          <>
            <p>
              Total spent: <strong>{money(String(totalSpent))}</strong>
            </p>
            <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 36)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 16 }}>
                <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="category" width={130} />
                <Tooltip formatter={(v) => money(String(v))} />
                <Bar dataKey="total" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
        <h3>Transactions</h3>
        {transactions.length === 0 ? (
          <p className="muted">No transactions this month.</p>
        ) : (
          <TransactionTable rows={transactions} />
        )}
      </section>

      <section>
        <h2>Category rules</h2>
        <p className="muted">Transactions whose description contains the text get this category, overriding Chase's.</p>
        <form onSubmit={addRule} className="row">
          <label>
            Description contains{" "}
            <input value={rule.match_text} onChange={(e) => setRule({ ...rule, match_text: e.target.value })} placeholder="TRADER JOE" />
          </label>
          <label>
            Category{" "}
            <input value={rule.category} onChange={(e) => setRule({ ...rule, category: e.target.value })} placeholder="Groceries" />
          </label>
          <button disabled={!rule.match_text.trim() || !rule.category.trim()}>Add rule</button>
        </form>
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
                  {imp.filename} · {imp.account} · {imp.row_count} rows · {new Date(imp.imported_at).toLocaleString()}
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

type Row = Pick<Transaction, "id" | "date" | "merchant" | "amount" | "category" | "is_transfer">;

function TransactionTable({ rows, flag }: { rows: Row[]; flag?: (index: number) => string }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Category</th>
            <th className="num">Amount</th>
            {flag && <th>Status</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td>{r.date}</td>
              <td>{r.merchant}</td>
              <td>{r.is_transfer ? <span className="muted">Transfer</span> : (r.category ?? "Uncategorized")}</td>
              <td className={`num ${Number(r.amount) > 0 ? "credit" : ""}`}>{money(r.amount)}</td>
              {flag && <td>{flag(i)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
