import { useState } from 'react'
import { useGql, useGqlMutation } from '../lib/api'
import { ALL_ACCOUNTS, ALL_TAGS, CATEGORY_LITE, TX_FIELDS } from '../lib/fragments'
import { colorOf, dayLabel, FREQUENCY_LABELS, money, todayStr, txMoney } from '../lib/format'
import type { AccountLite, CategoryLite, Frequency, Tag, Transaction } from '../lib/types'
import { CategoryChip, CategoryPicker, ConfirmButton, Drawer, ErrorNote, Field, Loading, Modal, Popover } from './ui'

export function TagPill({ tag }: { tag: Tag }) {
  const c = colorOf(tag.color)
  return <span className="tag-pill" style={{ color: c, borderColor: `${c}66` }}>#{tag.name}</span>
}

/** Transactions grouped by day, with optional checkboxes for bulk actions. */
export function TransactionList({
  transactions, onOpen, selected, onToggle, compact,
}: {
  transactions: Transaction[]
  onOpen: (id: string) => void
  selected?: Set<string>
  onToggle?: (id: string) => void
  compact?: boolean
}) {
  const days: [string, Transaction[]][] = []
  for (const t of transactions) {
    const last = days[days.length - 1]
    if (last && last[0] === t.date) last[1].push(t)
    else days.push([t.date, [t]])
  }
  return (
    <div className={`tx-list ${compact ? 'compact' : ''}`}>
      {days.map(([date, list]) => (
        <div key={date} className="tx-day">
          <div className="tx-day-label">
            <span>{dayLabel(date)}</span>
            <span className="muted">{money(list.filter((t) => t.type === 'regular').reduce((s, t) => s + t.amount, 0))}</span>
          </div>
          {list.map((t) => (
            <div
              key={t.id}
              className={`tx-row ${selected?.has(t.id) ? 'sel' : ''} ${t.isReviewed ? '' : 'unreviewed'}`}
              onClick={() => onOpen(t.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onOpen(t.id)}
            >
              {onToggle && (
                <input
                  type="checkbox"
                  aria-label={`Select ${t.name}`}
                  checked={selected?.has(t.id) ?? false}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onToggle(t.id)}
                />
              )}
              <span className="tx-dot" title={t.isReviewed ? 'Reviewed' : 'Needs review'} />
              <div className="tx-main">
                <div className="tx-name">
                  {t.name}
                  {t.isPending && <span className="badge">Pending</span>}
                  {t.recurring && <span className="badge" title={`Recurring: ${t.recurring.name}`}>↻</span>}
                  {t.isSplit && <span className="badge">Split</span>}
                </div>
                {!compact && (
                  <div className="tx-sub muted">
                    {t.account.name}{t.account.mask ? ` ··${t.account.mask}` : ''}
                    {t.tags.map((g) => <TagPill key={g.id} tag={g} />)}
                  </div>
                )}
              </div>
              <span className="tx-cat">{t.type === 'internal_transfer' ? <span className="chip chip-empty">TRANSFER</span> : <CategoryChip category={t.category} />}</span>
              <span className={`tx-amt ${t.amount < 0 ? 'pos' : ''}`}>{txMoney(t.amount)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

const TX_DETAIL = `query Tx($id: ID!) {
  transaction(id: $id) {
    ${TX_FIELDS}
    suggestedCategories { ${CATEGORY_LITE} }
    splits { id name amount category { ${CATEGORY_LITE} } }
  }
}`
const EDIT_TX = `mutation EditTx($id: ID!, $input: EditTransactionInput!) { editTransaction(id: $id, input: $input) { id } }`
const DELETE_TX = 'mutation DeleteTx($id: ID!) { deleteTransaction(id: $id) }'
const SPLIT_TX = 'mutation Split($id: ID!, $splits: [SplitInput!]!) { splitTransaction(id: $id, splits: $splits) { id } }'
const UNSPLIT_TX = 'mutation Unsplit($id: ID!) { unsplitTransaction(id: $id) { id } }'

type TxDetail = Transaction & { suggestedCategories: CategoryLite[]; splits: { id: string; name: string; amount: number; category: CategoryLite | null }[] }

/** Side panel to review and edit one transaction. */
export function TransactionDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading, error } = useGql<{ transaction: TxDetail | null }>(TX_DETAIL, { id })
  const edit = useGqlMutation(EDIT_TX)
  const del = useGqlMutation(DELETE_TX)
  const tags = useGql<{ tags: Tag[] }>(ALL_TAGS)
  const [mode, setMode] = useState<'view' | 'split' | 'recurring'>('view')
  const t = data?.transaction

  const save = (input: Record<string, unknown>) => edit.mutate({ id, input })

  return (
    <Drawer onClose={onClose} label="Transaction details">
      {isLoading && <Loading />}
      <ErrorNote error={error ?? edit.error ?? del.error} />
      {t && mode === 'view' && (
        <div className="drawer-body">
          <div className="drawer-hero">
            <div className={`drawer-amount ${t.amount < 0 ? 'pos' : ''}`}>{txMoney(t.amount)}</div>
            <input className="input title-input" defaultValue={t.name} key={t.name} aria-label="Name"
              onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && save({ name: e.target.value.trim() })} />
            <div className="muted">{dayLabel(t.date)} · {t.account.name}{t.isPending ? ' · Pending' : ''}</div>
          </div>

          <button className={`btn wide ${t.isReviewed ? '' : 'primary'}`} onClick={() => save({ isReviewed: !t.isReviewed })}>
            {t.isReviewed ? '✓ Reviewed · mark as unreviewed' : 'Mark as reviewed'}
          </button>

          {!t.isSplit && (
            <Field label="Category">
              <Popover
                trigger={(open) => <CategoryChip category={t.category} onClick={open} />}
              >
                {(close) => (
                  <CategoryPicker value={t.category?.id ?? null} suggested={t.suggestedCategories} onClose={close}
                    onChange={(categoryId) => save({ categoryId, isReviewed: true })} />
                )}
              </Popover>
              {t.suggestedCategories.length > 0 && !t.category && (
                <div className="suggest-row">
                  <span className="muted">Suggested:</span>
                  {t.suggestedCategories.map((c) => <CategoryChip key={c.id} category={c} onClick={() => save({ categoryId: c.id, isReviewed: true })} />)}
                </div>
              )}
            </Field>
          )}

          {t.isSplit && (
            <Field label="Split into">
              <div className="split-list">
                {t.splits.map((s) => (
                  <div key={s.id} className="split-row"><span>{s.name}</span><CategoryChip category={s.category} /><b>{money(s.amount)}</b></div>
                ))}
              </div>
            </Field>
          )}

          <div className="grid-2">
            <Field label="Amount">
              <input className="input" type="number" step="0.01" defaultValue={t.amount} key={`a${t.amount}`} disabled={t.isSplit}
                onBlur={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v) && v !== t.amount) save({ amount: v }) }} />
            </Field>
            <Field label="Date">
              <input className="input" type="date" defaultValue={t.date} key={`d${t.date}`} onBlur={(e) => e.target.value && e.target.value !== t.date && save({ date: e.target.value })} />
            </Field>
          </div>

          <Field label="Type">
            <select className="input" value={t.type} onChange={(e) => save({ type: e.target.value })}>
              <option value="regular">Regular (counts toward spending)</option>
              <option value="income">Income</option>
              <option value="internal_transfer">Internal transfer (ignored)</option>
            </select>
          </Field>

          <Field label="Tags">
            <div className="tag-select">
              {(tags.data?.tags ?? []).map((g) => {
                const on = t.tags.some((x) => x.id === g.id)
                const c = colorOf(g.color)
                return (
                  <button key={g.id} type="button" className={`tag-pill toggleable ${on ? 'on' : ''}`} style={{ color: c, borderColor: `${c}66`, background: on ? `${c}22` : undefined }}
                    onClick={() => save({ tagIds: on ? t.tags.filter((x) => x.id !== g.id).map((x) => x.id) : [...t.tags.map((x) => x.id), g.id] })}>
                    #{g.name}
                  </button>
                )
              })}
            </div>
          </Field>

          <Field label="Notes">
            <textarea className="input" rows={3} defaultValue={t.notes ?? ''} key={`n${t.notes}`} placeholder="Add a note"
              onBlur={(e) => e.target.value !== (t.notes ?? '') && save({ notes: e.target.value || null })} />
          </Field>

          <Field label="Recurring">
            {t.recurring ? (
              <div className="row gap">
                <span>{t.recurring.emoji} {t.recurring.name}</span>
                <button className="btn small" onClick={() => save({ recurringId: null })}>Unlink</button>
              </div>
            ) : (
              <button className="btn small" onClick={() => setMode('recurring')}>↻ Make recurring</button>
            )}
          </Field>

          <div className="drawer-actions">
            {t.isSplit ? <UnsplitButton id={t.id} /> : <button className="btn" onClick={() => setMode('split')}>Split transaction</button>}
            <ConfirmButton onConfirm={() => del.mutate({ id }, { onSuccess: onClose })}>Delete</ConfirmButton>
          </div>
        </div>
      )}
      {t && mode === 'split' && <SplitEditor tx={t} onDone={() => setMode('view')} />}
      {t && mode === 'recurring' && <RecurringFromTx tx={t} onDone={() => setMode('view')} />}
    </Drawer>
  )
}

function UnsplitButton({ id }: { id: string }) {
  const m = useGqlMutation(UNSPLIT_TX)
  return <button className="btn" onClick={() => m.mutate({ id })}>Undo split</button>
}

function SplitEditor({ tx, onDone }: { tx: TxDetail; onDone: () => void }) {
  const m = useGqlMutation(SPLIT_TX)
  const half = Math.round((tx.amount / 2) * 100) / 100
  const [parts, setParts] = useState([
    { amount: half, categoryId: tx.category?.id ?? null, name: tx.name },
    { amount: Math.round((tx.amount - half) * 100) / 100, categoryId: null as string | null, name: tx.name },
  ])
  const total = Math.round(parts.reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100
  const left = Math.round((tx.amount - total) * 100) / 100
  const { data } = useGql<{ allCategories: CategoryLite[] }>(`query { allCategories { ${CATEGORY_LITE} } }`)
  const catOf = (id: string | null) => data?.allCategories.find((c) => c.id === id) ?? null
  const update = (i: number, patch: Partial<(typeof parts)[number]>) => setParts(parts.map((p, k) => (k === i ? { ...p, ...patch } : p)))
  return (
    <div className="drawer-body">
      <h2>Split {money(tx.amount)}</h2>
      <p className="muted">Divide this charge across categories, like groceries and household items from one store run.</p>
      {parts.map((p, i) => (
        <div key={i} className="split-edit">
          <input className="input" value={p.name} onChange={(e) => update(i, { name: e.target.value })} aria-label="Part name" />
          <input className="input amount" type="number" step="0.01" value={p.amount} onChange={(e) => update(i, { amount: Number(e.target.value) })} aria-label="Part amount" />
          <Popover trigger={(open) => <CategoryChip category={catOf(p.categoryId)} onClick={open} />}>
            {(close) => <CategoryPicker value={p.categoryId} onChange={(categoryId) => update(i, { categoryId })} onClose={close} />}
          </Popover>
          {parts.length > 2 && <button className="icon-btn" aria-label="Remove part" onClick={() => setParts(parts.filter((_, k) => k !== i))}>✕</button>}
        </div>
      ))}
      <button className="btn small" onClick={() => setParts([...parts, { amount: left > 0 ? left : 0, categoryId: null, name: tx.name }])}>+ Add part</button>
      <div className={`split-left ${left === 0 ? 'ok' : 'bad'}`}>{left === 0 ? 'Parts add up ✓' : `${money(Math.abs(left))} ${left > 0 ? 'left to assign' : 'over'}`}</div>
      <ErrorNote error={m.error} />
      <div className="drawer-actions">
        <button className="btn" onClick={onDone}>Cancel</button>
        <button className="btn primary" disabled={left !== 0 || m.isPending}
          onClick={() => m.mutate({ id: tx.id, splits: parts.map((p) => ({ amount: Number(p.amount), categoryId: p.categoryId, name: p.name })) }, { onSuccess: onDone })}>
          Save split
        </button>
      </div>
    </div>
  )
}

const SUGGEST_FREQ = 'query Freq($name: String!) { suggestedRecurringFrequency(name: $name) }'
const CREATE_REC = 'mutation CreateRec($input: RecurringInput!) { createRecurring(input: $input) { id } }'

function RecurringFromTx({ tx, onDone }: { tx: TxDetail; onDone: () => void }) {
  const freq = useGql<{ suggestedRecurringFrequency: Frequency | null }>(SUGGEST_FREQ, { name: tx.name })
  return (
    <div className="drawer-body">
      <h2>Make recurring</h2>
      <p className="muted">Future charges matching these rules will be linked automatically.</p>
      {freq.isLoading ? <Loading /> : (
        <RecurringForm
          initial={{
            name: tx.name, emoji: tx.category?.emoji ?? '🔁', categoryId: tx.category?.id ?? null,
            frequency: freq.data?.suggestedRecurringFrequency ?? 'monthly', ruleNameContains: tx.name.toLowerCase(),
            minAmount: Math.round(tx.amount * 0.8 * 100) / 100, maxAmount: Math.round(tx.amount * 1.2 * 100) / 100,
          }}
          onDone={onDone}
        />
      )}
    </div>
  )
}

export type RecurringFormValues = {
  name: string; emoji: string; categoryId: string | null; frequency: Frequency; ruleNameContains: string; minAmount: number | null; maxAmount: number | null
}

/** Create (no id) or edit (with id) a recurring. */
export function RecurringForm({ initial, id, onDone }: { initial: RecurringFormValues; id?: string; onDone: () => void }) {
  const [v, setV] = useState(initial)
  const create = useGqlMutation(CREATE_REC)
  const edit = useGqlMutation('mutation EditRec($id: ID!, $input: RecurringInput!) { editRecurring(id: $id, input: $input) { id } }')
  const { data } = useGql<{ allCategories: CategoryLite[] }>(`query { allCategories { ${CATEGORY_LITE} } }`)
  const m = id ? edit : create
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const input = { ...v, minAmount: v.minAmount || null, maxAmount: v.maxAmount || null }
    m.mutate(id ? { id, input } : { input }, { onSuccess: onDone })
  }
  const num = (s: string) => (s === '' ? null : Number(s))
  return (
    <form className="form" onSubmit={submit}>
      <div className="grid-2">
        <Field label="Name"><input className="input" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Frequency">
          <select className="input" value={v.frequency} onChange={(e) => setV({ ...v, frequency: e.target.value as Frequency })}>
            {Object.entries(FREQUENCY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Category">
        <Popover trigger={(open) => <CategoryChip category={data?.allCategories.find((c) => c.id === v.categoryId) ?? null} onClick={open} />}>
          {(close) => <CategoryPicker value={v.categoryId} onChange={(categoryId) => setV({ ...v, categoryId, emoji: data?.allCategories.find((c) => c.id === categoryId)?.emoji ?? v.emoji })} onClose={close} />}
        </Popover>
      </Field>
      <Field label="Match transactions whose name contains" hint="Not case sensitive.">
        <input className="input" required value={v.ruleNameContains} onChange={(e) => setV({ ...v, ruleNameContains: e.target.value })} />
      </Field>
      <div className="grid-2">
        <Field label="Min amount"><input className="input" type="number" step="0.01" value={v.minAmount ?? ''} onChange={(e) => setV({ ...v, minAmount: num(e.target.value) })} placeholder="Any" /></Field>
        <Field label="Max amount"><input className="input" type="number" step="0.01" value={v.maxAmount ?? ''} onChange={(e) => setV({ ...v, maxAmount: num(e.target.value) })} placeholder="Any" /></Field>
      </div>
      <ErrorNote error={m.error} />
      <div className="drawer-actions">
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button className="btn primary" disabled={m.isPending}>{id ? 'Save' : 'Create recurring'}</button>
      </div>
    </form>
  )
}

const CREATE_TX = 'mutation CreateTx($input: CreateTransactionInput!) { createTransaction(input: $input) { id } }'

export function AddTransactionModal({ onClose, defaultAccountId }: { onClose: () => void; defaultAccountId?: string }) {
  const accounts = useGql<{ accounts: (AccountLite & { isClosed: boolean })[] }>(ALL_ACCOUNTS)
  const m = useGqlMutation(CREATE_TX)
  const { data } = useGql<{ allCategories: CategoryLite[] }>(`query { allCategories { ${CATEGORY_LITE} } }`)
  const [v, setV] = useState({ accountId: defaultAccountId ?? '', name: '', amount: '', date: todayStr(), categoryId: null as string | null, isIncome: false })
  const open = (accounts.data?.accounts ?? []).filter((a) => !a.isClosed)
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const amount = Math.abs(Number(v.amount)) * (v.isIncome ? -1 : 1)
    m.mutate(
      { input: { accountId: v.accountId || open[0]?.id, name: v.name, amount, date: v.date, categoryId: v.categoryId, type: v.isIncome ? 'income' : 'regular' } },
      { onSuccess: onClose },
    )
  }
  return (
    <Modal title="Add transaction" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Name"><input className="input" required autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Farmers market" /></Field>
        <div className="grid-2">
          <Field label="Amount"><input className="input" required type="number" step="0.01" min="0" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></Field>
          <Field label="Date"><input className="input" required type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
        </div>
        <div className="grid-2">
          <Field label="Account">
            <select className="input" value={v.accountId || open[0]?.id || ''} onChange={(e) => setV({ ...v, accountId: e.target.value })}>
              {open.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Kind">
            <select className="input" value={v.isIncome ? 'in' : 'out'} onChange={(e) => setV({ ...v, isIncome: e.target.value === 'in' })}>
              <option value="out">Expense</option>
              <option value="in">Income</option>
            </select>
          </Field>
        </div>
        <Field label="Category" hint="Leave empty to auto-categorize from past transactions with the same name.">
          <Popover trigger={(o) => <CategoryChip category={data?.allCategories.find((c) => c.id === v.categoryId) ?? null} onClick={o} />}>
            {(close) => <CategoryPicker value={v.categoryId} onChange={(categoryId) => setV({ ...v, categoryId })} onClose={close} />}
          </Popover>
        </Field>
        <ErrorNote error={m.error} />
        <div className="drawer-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={m.isPending}>Add</button>
        </div>
      </form>
    </Modal>
  )
}
