import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useOpenTransaction } from '../components/Layout'
import { RecurringForm, TransactionList } from '../components/transactions'
import { Card, CategoryChip, ConfirmButton, Empty, ErrorNote, Loading, Modal, PageHeader } from '../components/ui'
import { useGql, useGqlMutation } from '../lib/api'
import { CATEGORY_LITE, RECURRING_FIELDS, TX_FIELDS } from '../lib/fragments'
import { dayLabel, FREQUENCY_LABELS, money, shortDate } from '../lib/format'
import type { CategoryLite, Frequency, Recurring, Transaction } from '../lib/types'

const PER_MONTH: Record<Frequency, number> = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, semiannually: 1 / 6, yearly: 1 / 12 }

type Suggestion = {
  name: string; frequency: Frequency; category: CategoryLite | null; ruleNameContains: string
  minAmount: number | null; maxAmount: number | null; transactionCount: number; averageAmount: number; lastDate: string
}

const LIST = `query Recs {
  recurrings { ${RECURRING_FIELDS} }
  suggestedRecurrings { name frequency category { ${CATEGORY_LITE} } ruleNameContains minAmount maxAmount transactionCount averageAmount lastDate }
}`

export function Recurrings() {
  const { data, isLoading, error } = useGql<{ recurrings: Recurring[]; suggestedRecurrings: Suggestion[] }>(LIST)
  const addSuggested = useGqlMutation('mutation AddSug($names: [String!]) { createSuggestedRecurrings(names: $names) { id } }')
  const [creating, setCreating] = useState(false)
  if (isLoading) return <Loading />
  if (!data) return <ErrorNote error={error} />

  // Expenses only; income recurrings (negative amounts) are shown but not counted as costs.
  const active = data.recurrings.filter((r) => r.state === 'active')
  const monthly = active.reduce((s, r) => s + Math.max(r.nextPaymentAmount ?? 0, 0) * PER_MONTH[r.frequency], 0)
  const byState = (s: Recurring['state']) => data.recurrings.filter((r) => r.state === s).sort((a, b) => (a.nextPaymentDate ?? '9').localeCompare(b.nextPaymentDate ?? '9'))

  return (
    <div className="page">
      <PageHeader title="Recurrings">
        <button className="btn primary" onClick={() => setCreating(true)}>+ New recurring</button>
      </PageHeader>
      <Card className="summary">
        <div className="summary-stats">
          <div><small className="muted">ACTIVE</small><b>{active.length}</b></div>
          <div><small className="muted">ABOUT PER MONTH</small><b>{money(monthly)}</b></div>
          <div><small className="muted">PER YEAR</small><b>{money(monthly * 12)}</b></div>
        </div>
      </Card>

      {data.suggestedRecurrings.length > 0 && (
        <Card
          className="suggestions"
          title={<>↻ Found {data.suggestedRecurrings.length} recurring charges you aren't tracking</>}
          action={<button className="btn small primary" disabled={addSuggested.isPending} onClick={() => addSuggested.mutate({})}>Add all</button>}
        >
          <p className="muted">These merchants charge you on a regular schedule. Add them to see them in upcoming bills and budgets.</p>
          <div className="list">
            {data.suggestedRecurrings.map((s) => (
              <div key={s.name} className="list-row">
                <span className="emoji">{s.category?.emoji ?? '🔁'}</span>
                <span className="grow">
                  {s.name}
                  <small className="muted block">{FREQUENCY_LABELS[s.frequency]} · {s.transactionCount} charges · last {shortDate(s.lastDate)}</small>
                </span>
                <CategoryChip category={s.category} />
                <b>{money(s.averageAmount)}</b>
                <button className="btn small" disabled={addSuggested.isPending} onClick={() => addSuggested.mutate({ names: [s.name] })}>Add</button>
              </div>
            ))}
          </div>
          <ErrorNote error={addSuggested.error} />
        </Card>
      )}

      {(['active', 'paused', 'archived'] as const).map((state) => {
        const list = byState(state)
        if (!list.length && state !== 'active') return null
        return (
          <section key={state}>
            <h2 className="section-label">{state[0].toUpperCase() + state.slice(1)} ({list.length})</h2>
            <div className="card">
              {list.length === 0 ? <Empty>No recurrings yet.</Empty> : (
                <div className="list">
                  {list.map((r) => (
                    <Link key={r.id} to={`/recurrings/${r.id}`} className="list-row">
                      <span className="emoji">{r.emoji}</span>
                      <span className="grow">{r.name}<small className="muted block">{FREQUENCY_LABELS[r.frequency]}</small></span>
                      <CategoryChip category={r.category} />
                      <span className="muted next-date">{r.nextPaymentDate ? `Next ${dayLabel(r.nextPaymentDate)}` : '—'}</span>
                      <b className={r.nextPaymentAmount != null && r.nextPaymentAmount < 0 ? 'good' : ''}>
                        {r.nextPaymentAmount != null ? money(Math.abs(r.nextPaymentAmount)) : '—'}
                      </b>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        )
      })}
      {creating && (
        <Modal title="New recurring" onClose={() => setCreating(false)}>
          <RecurringForm onDone={() => setCreating(false)}
            initial={{ name: '', emoji: '🔁', categoryId: null, frequency: 'monthly', ruleNameContains: '', minAmount: null, maxAmount: null }} />
        </Modal>
      )}
    </div>
  )
}

const DETAIL = `query Rec($id: ID!) {
  recurring(id: $id) {
    ${RECURRING_FIELDS}
    payments { date amount isPaid }
    keyMetrics { averageTransactionAmount totalSpent count }
    transactions { ${TX_FIELDS} }
  }
}`

export function RecurringDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const openTx = useOpenTransaction()
  const [editing, setEditing] = useState(false)
  const { data, isLoading, error } = useGql<{
    recurring: (Recurring & { payments: { date: string; amount: number; isPaid: boolean }[]; keyMetrics: { averageTransactionAmount: number; totalSpent: number; count: number }; transactions: Transaction[] }) | null
  }>(DETAIL, { id })
  const edit = useGqlMutation('mutation SetState($id: ID!, $input: RecurringInput!) { editRecurring(id: $id, input: $input) { id } }')
  const del = useGqlMutation('mutation DelRec($id: ID!) { deleteRecurring(id: $id) }')
  if (isLoading) return <Loading />
  const r = data?.recurring
  if (!r) return <ErrorNote error={error ?? 'Recurring not found'} />
  const upcoming = r.payments.filter((p) => !p.isPaid)
  const paid = r.payments.filter((p) => p.isPaid).reverse()
  return (
    <div className="page">
      <PageHeader title={<><Link to="/recurrings" className="crumb">Recurrings</Link> {r.emoji} {r.name}</>}>
        {r.state === 'active' && <button className="btn" onClick={() => edit.mutate({ id, input: { state: 'paused' } })}>Pause</button>}
        {r.state !== 'active' && <button className="btn" onClick={() => edit.mutate({ id, input: { state: 'active' } })}>Resume</button>}
        {r.state !== 'archived' && <button className="btn" onClick={() => edit.mutate({ id, input: { state: 'archived' } })}>Archive</button>}
        <button className="btn" onClick={() => setEditing(true)}>Edit</button>
        <ConfirmButton onConfirm={() => del.mutate({ id }, { onSuccess: () => nav('/recurrings') })}>Delete</ConfirmButton>
      </PageHeader>
      <ErrorNote error={edit.error ?? del.error} />
      <div className="detail-grid">
        <Card title="Overview">
          <div className="stat-row">
            <div><small className="muted">NEXT</small><b>{r.nextPaymentDate ? shortDate(r.nextPaymentDate) : r.state === 'active' ? '—' : r.state}</b></div>
            <div><small className="muted">AMOUNT</small><b>{r.nextPaymentAmount != null ? money(Math.abs(r.nextPaymentAmount)) : '—'}</b></div>
            <div><small className="muted">FREQUENCY</small><b>{FREQUENCY_LABELS[r.frequency]}</b></div>
          </div>
          <div className="stat-row">
            <div><small className="muted">LAST 12 MONTHS</small><b>{money(Math.abs(r.keyMetrics.totalSpent))}</b></div>
            <div><small className="muted">AVERAGE</small><b>{money(Math.abs(r.keyMetrics.averageTransactionAmount))}</b></div>
            <div><small className="muted">PAYMENTS</small><b>{r.keyMetrics.count}</b></div>
          </div>
          <div className="rule muted">
            Matches transactions containing “{r.rule.nameContains}”
            {r.rule.minAmount != null && r.rule.maxAmount != null ? ` between ${money(r.rule.minAmount)} and ${money(r.rule.maxAmount)}` : ''}.
          </div>
          <CategoryChip category={r.category} />
        </Card>
        <Card title="Payments">
          <div className="timeline">
            {upcoming.map((p) => (
              <div key={`u${p.date}`} className="tl-row upcoming"><span className="tl-dot" /><span className="grow">{dayLabel(p.date)}</span><span className="badge">Upcoming</span><b>{money(Math.abs(p.amount))}</b></div>
            ))}
            {paid.slice(0, 12).map((p) => (
              <div key={`p${p.date}${p.amount}`} className="tl-row"><span className="tl-dot paid" /><span className="grow">{shortDate(p.date)}</span><span className="muted">Paid</span><b>{money(Math.abs(p.amount))}</b></div>
            ))}
            {!r.payments.length && <Empty>No payments yet.</Empty>}
          </div>
        </Card>
      </div>
      <h2 className="section-label">Transactions ({r.transactions.length})</h2>
      <div className="card">
        {r.transactions.length ? <TransactionList transactions={r.transactions} onOpen={openTx} /> : <Empty>No transactions matched yet.</Empty>}
      </div>
      {editing && (
        <Modal title="Edit recurring" onClose={() => setEditing(false)}>
          <RecurringForm id={r.id} onDone={() => setEditing(false)} initial={{
            name: r.name, emoji: r.emoji, categoryId: r.category?.id ?? null, frequency: r.frequency,
            ruleNameContains: r.rule.nameContains, minAmount: r.rule.minAmount, maxAmount: r.rule.maxAmount,
          }} />
        </Modal>
      )}
    </div>
  )
}
