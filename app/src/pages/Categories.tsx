import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BarChart, Progress, Ring } from '../components/charts'
import { useOpenTransaction } from '../components/Layout'
import { TransactionList } from '../components/transactions'
import { Card, ColorPicker, ConfirmButton, Empty, EmojiPicker, ErrorNote, Field, Loading, Modal, PageHeader, Toggle } from '../components/ui'
import { useGql, useGqlMutation } from '../lib/api'
import { CATEGORY_LITE, TX_FIELDS } from '../lib/fragments'
import { colorOf, money, monthLabel, shiftMonth, thisMonth } from '../lib/format'
import type { CategoryLite, MonthlyBudget, MonthlySpend, Transaction } from '../lib/types'

type Cat = CategoryLite & { rolloverEnabled: boolean; spend: MonthlySpend; budget: MonthlyBudget; childCategories: Cat[] }
const CAT_FIELDS = `${CATEGORY_LITE} rolloverEnabled spend(month: $month) { amount comparisonAmount unpaidRecurringAmount } budget(month: $month) { amount rolloverAmount childAmount childRolloverAmount resolvedAmount }`
const LIST = `query Cats($month: String) {
  categoriesTotal { spend(month: $month) { amount comparisonAmount } budget(month: $month) { resolvedAmount rolloverAmount childRolloverAmount } }
  categories { ${CAT_FIELDS} childCategories { ${CAT_FIELDS} childCategories { id } } }
}`

function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="month-switch">
      <button className="icon-btn" aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}>‹</button>
      <b>{monthLabel(month)}</b>
      <button className="icon-btn" aria-label="Next month" disabled={month >= thisMonth()} onClick={() => onChange(shiftMonth(month, 1))}>›</button>
    </div>
  )
}

const Left = ({ spent, budget }: { spent: number; budget: number }) =>
  budget > 0 ? <span className={spent > budget ? 'bad' : 'good'}>{money(Math.abs(budget - spent))} {spent > budget ? 'over' : 'left'}</span> : <span className="muted">No budget</span>

export function Categories() {
  const [month, setMonth] = useState(thisMonth())
  const [creating, setCreating] = useState(false)
  const { data, isLoading, error } = useGql<{ categoriesTotal: { spend: MonthlySpend; budget: MonthlyBudget }; categories: Cat[] }>(LIST, { month })
  if (isLoading) return <Loading />
  if (!data) return <ErrorNote error={error} />
  const t = data.categoriesTotal
  const spending = data.categories.filter((c) => !c.isExcluded)
  const excluded = data.categories.filter((c) => c.isExcluded)
  const rollover = t.budget.rolloverAmount + t.budget.childRolloverAmount
  return (
    <div className="page">
      <PageHeader title="Categories">
        <MonthSwitcher month={month} onChange={setMonth} />
        <button className="btn primary" onClick={() => setCreating(true)}>+ New category</button>
      </PageHeader>
      <Card className="summary">
        <Ring spent={t.spend.amount} budget={t.budget.resolvedAmount} size={84}>
          <b>{t.budget.resolvedAmount > 0 ? Math.round((t.spend.amount / t.budget.resolvedAmount) * 100) : 0}%</b>
        </Ring>
        <div className="summary-stats">
          <div><small className="muted">SPENT</small><b>{money(t.spend.amount)}</b></div>
          <div><small className="muted">BUDGET</small><b>{money(t.budget.resolvedAmount)}</b></div>
          <div><small className="muted">REMAINING</small><b><Left spent={t.spend.amount} budget={t.budget.resolvedAmount} /></b></div>
          {rollover !== 0 && <div><small className="muted">INCLUDES ROLLOVER</small><b>{money(rollover)}</b></div>}
        </div>
      </Card>
      <div className="cat-groups">
        {spending.map((p) => <CategoryGroup key={p.id} cat={p} />)}
      </div>
      {excluded.length > 0 && (
        <>
          <h2 className="section-label">Excluded from spending</h2>
          <div className="cat-groups">{excluded.map((p) => <CategoryGroup key={p.id} cat={p} />)}</div>
        </>
      )}
      {creating && <CategoryModal onClose={() => setCreating(false)} parents={data.categories} />}
    </div>
  )
}

function CategoryGroup({ cat }: { cat: Cat }) {
  const rows = [cat, ...cat.childCategories]
  return (
    <div className="card cat-group">
      {rows.map((c, i) => {
        const spent = c.spend.amount
        const budget = c.budget.resolvedAmount
        return (
          <Link key={c.id} to={`/categories/${c.id}`} className={`cat-row ${i === 0 ? 'parent' : 'child'}`}>
            <span className="cat-emoji" style={{ background: `${colorOf(c.color)}22` }}>{c.emoji}</span>
            <span className="grow">
              <span className="row gap">
                {c.name}
                {c.rolloverEnabled && <span className="badge" title="Unspent budget rolls over">↻ rollover</span>}
              </span>
              {!c.isExcluded && <Progress value={spent} max={budget} thin />}
            </span>
            <span className="cat-nums">
              <b>{money(spent)}</b>
              <small className="muted">{budget > 0 ? `of ${money(budget)}` : ''}</small>
            </span>
            {!c.isExcluded && <span className="cat-left"><Left spent={spent} budget={budget} /></span>}
          </Link>
        )
      })}
    </div>
  )
}

const CREATE = `mutation CreateCat($input: CategoryInput!) { createCategory(input: $input) { id } }`
const EDIT = `mutation EditCat($id: ID!, $input: CategoryInput!) { editCategory(id: $id, input: $input) { id } }`

function CategoryModal({ onClose, parents, existing }: { onClose: () => void; parents: CategoryLite[]; existing?: Cat }) {
  const [v, setV] = useState({
    name: existing?.name ?? '', emoji: existing?.emoji ?? '📁', color: existing?.color ?? 'blue',
    parentId: existing?.parentId ?? '', rolloverEnabled: existing?.rolloverEnabled ?? false, isExcluded: existing?.isExcluded ?? false,
  })
  const m = useGqlMutation(existing ? EDIT : CREATE)
  const hasChildren = (existing?.childCategories.length ?? 0) > 0
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const input = { ...v, parentId: v.parentId || null }
    m.mutate(existing ? { id: existing.id, input } : { input }, { onSuccess: onClose })
  }
  return (
    <Modal title={existing ? 'Edit category' : 'New category'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Name"><input className="input" required autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Icon"><EmojiPicker value={v.emoji} onChange={(emoji) => setV({ ...v, emoji })} /></Field>
        <Field label="Color"><ColorPicker value={v.color} onChange={(color) => setV({ ...v, color })} /></Field>
        {!hasChildren && (
          <Field label="Group under">
            <select className="input" value={v.parentId} onChange={(e) => setV({ ...v, parentId: e.target.value })}>
              <option value="">None (top level)</option>
              {parents.filter((p) => !p.parentId && p.id !== existing?.id).map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
            </select>
          </Field>
        )}
        <Toggle checked={v.rolloverEnabled} onChange={(rolloverEnabled) => setV({ ...v, rolloverEnabled })} label="Roll over unspent budget to next month" />
        <Toggle checked={v.isExcluded} onChange={(isExcluded) => setV({ ...v, isExcluded })} label="Exclude from spending and budgets" />
        <ErrorNote error={m.error} />
        <div className="drawer-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={m.isPending}>{existing ? 'Save' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  )
}

const DETAIL = `query Cat($id: ID!, $month: String, $from: String, $to: String) {
  category(id: $id) {
    ${CAT_FIELDS} canBeDeleted
    childCategories { ${CAT_FIELDS} childCategories { id } }
    spendHistory(months: 12) { month amount }
    budgetHistory(months: 12) { month resolvedAmount }
    keyMetrics { averageMonthlySpent totalSpent year }
  }
  categories { ${CATEGORY_LITE} }
  transactions(first: 100, filter: { categoryIds: [$id], from: $from, to: $to }) { totalCount edges { node { ${TX_FIELDS} } } }
}`

export function CategoryDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const openTx = useOpenTransaction()
  const [month, setMonth] = useState(thisMonth())
  const [editing, setEditing] = useState(false)
  const [budgetInput, setBudgetInput] = useState<string | null>(null)
  const { data, isLoading, error } = useGql<{
    category: (Cat & { canBeDeleted: boolean; spendHistory: { month: string; amount: number }[]; budgetHistory: { month: string; resolvedAmount: number }[]; keyMetrics: { averageMonthlySpent: number; totalSpent: number; year: number } }) | null
    categories: CategoryLite[]
    transactions: { totalCount: number; edges: { node: Transaction }[] }
  }>(DETAIL, { id, month, from: `${month}-01`, to: `${month}-31` })
  const setBudget = useGqlMutation('mutation SetBudget($categoryId: ID!, $amount: Float!, $month: String) { setBudget(categoryId: $categoryId, amount: $amount, month: $month) { id } }')
  const del = useGqlMutation('mutation DelCat($id: ID!) { deleteCategory(id: $id) }')

  if (isLoading) return <Loading />
  const c = data?.category
  if (!c) return <ErrorNote error={error ?? 'Category not found'} />
  const b = c.budget
  const hasKids = c.childCategories.length > 0
  return (
    <div className="page">
      <PageHeader title={<><Link to="/categories" className="crumb">Categories</Link> <span className="cat-emoji big" style={{ background: `${colorOf(c.color)}22` }}>{c.emoji}</span> {c.name}</>}>
        <MonthSwitcher month={month} onChange={(m) => { setMonth(m); setBudgetInput(null) }} />
        <button className="btn" onClick={() => setEditing(true)}>Edit</button>
        {c.canBeDeleted && <ConfirmButton onConfirm={() => del.mutate({ id }, { onSuccess: () => nav('/categories') })}>Delete</ConfirmButton>}
      </PageHeader>
      <ErrorNote error={setBudget.error ?? del.error} />
      <div className="detail-grid">
        <Card title={`Budget · ${monthLabel(month)}`}>
          {c.isExcluded ? <Empty>This category is excluded from spending, so it has no budget.</Empty> : (
            <>
              <div className="stat-row">
                <div><small className="muted">SPENT</small><b>{money(c.spend.amount)}</b></div>
                <div><small className="muted">BUDGET</small><b>{money(b.resolvedAmount)}</b></div>
                <div><small className="muted">LEFT</small><b><Left spent={c.spend.amount} budget={b.resolvedAmount} /></b></div>
              </div>
              <Progress value={c.spend.amount} max={b.resolvedAmount} />
              <form className="budget-form" onSubmit={(e) => {
                e.preventDefault()
                if (budgetInput != null) setBudget.mutate({ categoryId: c.id, amount: Number(budgetInput) || 0, month }, { onSuccess: () => setBudgetInput(null) })
              }}>
                <Field label={hasKids ? 'Extra budget for the group (on top of subcategories)' : 'Monthly budget'} hint={`Applies to ${monthLabel(month)} and later months.`}>
                  <div className="row gap">
                    <input className="input" type="number" min="0" step="1" value={budgetInput ?? b.amount} onChange={(e) => setBudgetInput(e.target.value)} />
                    <button className="btn primary" disabled={budgetInput == null || setBudget.isPending}>Save</button>
                  </div>
                </Field>
              </form>
              <div className="breakdown muted">
                {hasKids && <div>Subcategories: {money(b.childAmount)}</div>}
                {(b.rolloverAmount !== 0 || b.childRolloverAmount !== 0) && <div>Rolled over from last month: {money(b.rolloverAmount + b.childRolloverAmount)}</div>}
                {c.spend.unpaidRecurringAmount > 0 && <div>Still to come from recurrings: {money(c.spend.unpaidRecurringAmount)}</div>}
              </div>
            </>
          )}
        </Card>
        <Card title="Last 12 months">
          <BarChart format={(n) => money(n, true)} data={c.spendHistory.map((s, i) => ({
            label: monthLabel(s.month, false), value: s.amount, budget: c.budgetHistory[i]?.resolvedAmount, highlight: s.month === month,
          }))} />
          <div className="stat-row">
            <div><small className="muted">AVG / MONTH ({c.keyMetrics.year})</small><b>{money(c.keyMetrics.averageMonthlySpent)}</b></div>
            <div><small className="muted">TOTAL {c.keyMetrics.year}</small><b>{money(c.keyMetrics.totalSpent)}</b></div>
          </div>
        </Card>
      </div>
      {hasKids && (
        <>
          <h2 className="section-label">Subcategories</h2>
          <CategoryGroup cat={{ ...c, childCategories: c.childCategories }} />
        </>
      )}
      <h2 className="section-label">Transactions in {monthLabel(month)} ({data.transactions.totalCount})</h2>
      <div className="card">
        {data.transactions.edges.length ? <TransactionList transactions={data.transactions.edges.map((e) => e.node)} onOpen={openTx} /> : <Empty>No transactions this month.</Empty>}
      </div>
      {editing && <CategoryModal onClose={() => setEditing(false)} parents={data.categories} existing={c} />}
    </div>
  )
}
