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
export type Preview = {
  bank: string;
  warning: string | null;
  already_imported: boolean;
  last4: string | null;
  rows: PreviewRow[];
};
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
  merchant_key: string;
};
export type Rule = { id: number; match_text: string; category: string };
/** parent is null for a top-level category, or the parent's name for a subcategory. */
export type Category = { id: number; name: string; parent: string | null };
export type TransactionFilter ={ start: string | null; end: string | null; accountIds: number[] };

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

const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const post = (body: unknown) => send("POST", body);

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
  categories: () => request<Category[]>("/categories"),
  createCategory: (name: string, parent: string | null) => request<Category>("/categories", post({ name, parent })),
  renameCategory: (id: number, name: string) => request<Category>(`/categories/${id}`, send("PATCH", { name })),
  deleteCategory: (id: number) => request<{ ok: boolean; moved: number }>(`/categories/${id}`, { method: "DELETE" }),
  setCategory: (transactionId: number, category: string | null, applyToMerchant = false) =>
    request<{ category: string | null; updated: number }>(
      `/transactions/${transactionId}`,
      send("PATCH", { category, apply_to_merchant: applyToMerchant }),
    ),
  createRule: (match_text: string, category: string) => request("/rules", post({ match_text, category })),
  rules: () => request<Rule[]>("/rules"),
  deleteRule: (id: number) => request<{ ok: boolean }>(`/rules/${id}`, { method: "DELETE" }),
};

export const money = (amount: string) =>
  Number(amount).toLocaleString("en-US", { style: "currency", currency: "USD" });
