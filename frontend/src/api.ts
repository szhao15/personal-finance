// Amounts arrive as strings (exact decimals from Postgres); convert only for display.
export type Account = { id: number; name: string; institution: string; last4: string | null };
export type PreviewRow = {
  date: string;
  merchant: string;
  amount: string;
  category: string | null;
  is_transfer: boolean;
  duplicate: boolean;
};
export type Preview = { already_imported: boolean; last4: string | null; rows: PreviewRow[] };
export type CommitResult = { import_id: number | null; inserted: number; skipped: number };
export type ImportRecord = { id: number; account: string; filename: string; row_count: number; imported_at: string };
export type Transaction = {
  id: number;
  date: string;
  merchant: string;
  amount: string;
  category: string | null;
  is_transfer: boolean;
  account: string;
};
export type TransactionFilter = { start: string | null; end: string | null; accountIds: number[] };

function transactionQuery({ start, end, accountIds }: TransactionFilter) {
  const query = new URLSearchParams();
  if (start) query.set("start", start);
  if (end) query.set("end", end);
  accountIds.forEach((id) => query.append("account_id", String(id)));
  return query.toString();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    throw new Error(typeof detail === "string" ? detail : `Request failed (${res.status})`);
  }
  return res.json();
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function upload<T>(path: string, accountId: number, file: File) {
  const form = new FormData();
  form.append("account_id", String(accountId));
  form.append("file", file);
  return request<T>(path, { method: "POST", body: form });
}

export const api = {
  accounts: () => request<Account[]>("/accounts"),
  createAccount: (name: string) => request<Account>("/accounts", post({ name })),
  preview: (accountId: number, file: File) => upload<Preview>("/imports/preview", accountId, file),
  commit: (accountId: number, file: File) => upload<CommitResult>("/imports", accountId, file),
  imports: () => request<ImportRecord[]>("/imports"),
  undoImport: (id: number) => request<{ ok: boolean }>(`/imports/${id}`, { method: "DELETE" }),
  transactions: (filter: TransactionFilter) => request<Transaction[]>(`/transactions?${transactionQuery(filter)}`),
  categories: () => request<string[]>("/categories"),
  createRule: (match_text: string, category: string) => request("/rules", post({ match_text, category })),
};

export const money = (amount: string) =>
  Number(amount).toLocaleString("en-US", { style: "currency", currency: "USD" });
