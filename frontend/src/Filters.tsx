import { PRESETS, formatCents, type CategoryStat, type Preset, type Range } from "./analytics";
import type { Account } from "./api";

export function FilterBar({
  accounts,
  accountIds,
  onAccountsChange,
  preset,
  onPresetChange,
  custom,
  onCustomChange,
}: {
  accounts: Account[];
  accountIds: number[];
  onAccountsChange: (ids: number[]) => void;
  preset: Preset;
  onPresetChange: (preset: Preset) => void;
  custom: Range;
  onCustomChange: (range: Range) => void;
}) {
  // An empty selection means "all accounts"; picking every account collapses back to that.
  const toggle = (id: number) => {
    const next = accountIds.includes(id) ? accountIds.filter((x) => x !== id) : [...accountIds, id];
    onAccountsChange(next.length === accounts.length ? [] : next);
  };

  return (
    <div className="filters">
      <fieldset>
        <legend>Accounts</legend>
        <label className="check">
          <input type="checkbox" checked={accountIds.length === 0} onChange={() => onAccountsChange([])} />
          All accounts
        </label>
        {accounts.map((a) => (
          <label key={a.id} className="check">
            <input type="checkbox" checked={accountIds.includes(a.id)} onChange={() => toggle(a.id)} />
            {a.name}
            {a.last4 ? ` ••${a.last4}` : ""}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Time range</legend>
        <select aria-label="Time range" value={preset} onChange={(e) => onPresetChange(e.target.value as Preset)}>
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        {preset === "custom" && (
          <>
            <label>
              From{" "}
              <input type="date" value={custom.start ?? ""} onChange={(e) => onCustomChange({ ...custom, start: e.target.value || null })} />
            </label>
            <label>
              To <input type="date" value={custom.end ?? ""} onChange={(e) => onCustomChange({ ...custom, end: e.target.value || null })} />
            </label>
          </>
        )}
      </fieldset>
    </div>
  );
}

export function CategoryFilter({
  stats,
  selected,
  onChange,
  colorOf,
}: {
  stats: CategoryStat[];
  selected: string[];
  onChange: (selected: string[]) => void;
  colorOf: (name: string) => string;
}) {
  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter((s) => s !== name) : [...selected, name]);

  return (
    <div>
      <div className="row spread">
        <p className="muted">
          {selected.length === 0 ? "Showing all categories. Click to filter." : `Filtering by ${selected.length} of ${stats.length} categories.`}
        </p>
        {selected.length > 0 && (
          <button className="secondary" onClick={() => onChange([])}>
            Show all categories
          </button>
        )}
      </div>
      <div className="chips">
        {/* Each top-level category is grouped with its subcategories; its totals include them. */}
        {stats
          .filter((s) => !s.parent)
          .map((top) => (
            <span key={top.name} className="chip-group">
              {[top, ...stats.filter((s) => s.parent === top.name)].map((s) => (
                <button
                  key={s.name}
                  type="button"
                  className={`chip${s.parent ? " sub" : ""}${s.count === 0 ? " empty" : ""}`}
                  aria-pressed={selected.includes(s.name)}
                  onClick={() => toggle(s.name)}
                >
                  <span className="dot" style={{ background: colorOf(s.name) }} aria-hidden />
                  {s.parent && <span aria-hidden>↳ </span>}
                  {s.name}
                  {s.parent && <span className="sr-only">, in {s.parent}</span>}
                  <span className="chip-meta">
                    {formatCents(s.cents)} · {s.count}
                  </span>
                </button>
              ))}
            </span>
          ))}
      </div>
    </div>
  );
}
