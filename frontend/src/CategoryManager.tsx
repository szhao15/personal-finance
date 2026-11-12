import { useState, type FormEvent } from "react";
import type { Category } from "./api";

/** Create, rename and delete categories. Subcategories are one level deep (e.g. Entertainment ↳ Movies). */
export function CategoryManager({
  categories,
  onCreate,
  onRename,
  onDelete,
}: {
  categories: Category[];
  onCreate: (name: string, parent: string | null) => void;
  onRename: (category: Category, name: string) => void;
  onDelete: (category: Category) => void;
}) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const topLevel = categories.filter((c) => !c.parent);

  const create = (e: FormEvent) => {
    e.preventDefault();
    onCreate(name.trim(), parent || null);
    setName("");
  };

  const rename = (c: Category) => {
    const next = window.prompt(`Rename "${c.name}" to:`, c.name)?.trim();
    if (next && next !== c.name) onRename(c, next);
  };

  const remove = (c: Category) => {
    const subs = categories.filter((s) => s.parent === c.name).map((s) => s.name);
    const lines = [
      `Delete the category "${c.name}"?`,
      `• Its transactions move to ${c.parent ? `"${c.parent}"` : "Uncategorized"}.`,
      "• Rules that use it are removed.",
      ...(subs.length ? [`• ${subs.join(", ")} become top-level categories.`] : []),
    ];
    if (window.confirm(lines.join("\n"))) onDelete(c);
  };

  return (
    <>
      <form onSubmit={create} className="row">
        <label>
          New category <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Inside{" "}
          <select value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">— top level —</option>
            {topLevel.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button disabled={!name.trim()}>Add category</button>
      </form>
      {categories.length === 0 ? (
        <p className="muted">No categories yet. Importing a statement creates them, or add your own above.</p>
      ) : (
        <ul className="imports">
          {categories.map((c) => (
            <li key={c.id} className={c.parent ? "sub" : undefined}>
              <span>
                {c.parent && <span aria-hidden>↳ </span>}
                {c.name}
                {c.parent && <span className="sr-only">, in {c.parent}</span>}
              </span>
              <span className="row">
                <button className="secondary" onClick={() => rename(c)} aria-label={`Rename ${c.name}`}>
                  Rename
                </button>
                <button className="secondary" onClick={() => remove(c)} aria-label={`Delete ${c.name}`}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
