import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { LineChart, Progress } from '../components/charts'
import { useOpenTransaction } from '../components/Layout'
import { AddTransactionModal, TransactionList } from '../components/transactions'
import { Card, ConfirmButton, Empty, ErrorNote, Field, Loading, Modal, PageHeader, TimeFrameTabs, Toggle } from '../components/ui'
import { useGql, useGqlMutation } from '../lib/api'
import { ACCOUNT_FIELDS, TX_FIELDS } from '../lib/fragments'
import { ACCOUNT_TYPE_LABELS, money, pct, shortDate } from '../lib/format'
import type { Account, TimeFrame, Transaction } from '../lib/types'
import { HoldingsTable, type HoldingRow } from './Investments'

const TYPE_ORDER = ['depository', 'credit', 'investment', 'real_estate', 'loan', 'other']

export function Accounts() {
  const [tf, setTf] = useState<TimeFrame>('ONE_YEAR')
  const [showHidden, setShowHidden] = useState(false)
  const [adding, setAdding] = useState(false)
  const { data, isLoading, error } = useGql<{ accounts: Account[]; networthHistory: { date: string; total: number; assets: number; debt: number }[] }>(
    `query Accts($tf: TimeFrame, $hidden: Boolean) { accounts(includeHidden: $hidden) { ${ACCOUNT_FIELDS} } networthHistory(timeFrame: $tf) { date total assets debt } }`,
    { tf, hidden: showHidden },
  )
  if (isLoading) return <Loading />
  if (!data) return <ErrorNote error={error} />
  const h = data.networthHistory
  const last = h.at(-1)!
  const change = h.length > 1 ? ((last.total - h[0].total) / Math.abs(h[0].total || 1)) * 100 : 0
  const groups = TYPE_ORDER.map((t) => [t, data.accounts.filter((a) => a.type === t)] as const).filter(([, l]) => l.length)

  return (
    <div className="page">
      <PageHeader title="Accounts">
        <Toggle checked={showHidden} onChange={setShowHidden} label="Show hidden" />
        <button className="btn primary" onClick={() => setAdding(true)}>+ Add manual account</button>
      </PageHeader>
      <Card title="Net worth" action={<TimeFrameTabs value={tf} onChange={setTf} />}>
        <div className="big-stat">
          <div className="big-num">{money(last.total)}</div>
          <div><span className={`delta ${change >= 0 ? 'up' : 'down'}`}>{pct(change)}</span> <span className="muted">{money(last.assets, true)} assets · {money(last.debt, true)} debt</span></div>
        </div>
        <LineChart height={200} format={(n) => money(n, true)} labels={h.map((p) => shortDate(p.date))}
          series={[
            { values: h.map((p) => p.assets), color: '#40bf40', dashed: true, label: 'Assets' },
            { values: h.map((p) => p.total), color: '#3d82ff', fill: true, label: 'Net worth' },
          ]} />
      </Card>
      {groups.map(([type, list]) => (
        <section key={type}>
          <h2 className="section-label row between">
            <span>{ACCOUNT_TYPE_LABELS[type]}</span>
            <span>{money(list.filter((a) => !a.isClosed).reduce((s, a) => s + a.balance, 0))}</span>
          </h2>
          <div className="card list">
            {list.map((a) => (
              <Link key={a.id} to={`/accounts/${a.id}`} className={`list-row ${a.isHidden || a.isClosed ? 'dim' : ''}`}>
                <span className="acct-logo" style={{ background: a.color }}>{(a.institution ?? a.name)[0]}</span>
                <span className="grow">
                  {a.name}
                  <small className="muted block">
                    {a.institution}{a.mask ? ` ··${a.mask}` : ''}{a.isManual ? ' · Manual' : ''}{a.isHidden ? ' · Hidden' : ''}{a.isClosed ? ' · Closed' : ''}
                  </small>
                </span>
                {a.change3m != null && <span className={`delta ${(a.isDebt ? -a.change3m : a.change3m) >= 0 ? 'up' : 'down'}`} title="3 month change">{pct(a.change3m)}</span>}
                <b>{money(a.balance)}</b>
              </Link>
            ))}
          </div>
        </section>
      ))}
      {adding && <AccountModal onClose={() => setAdding(false)} />}
    </div>
  )
}

function AccountModal({ onClose, existing }: { onClose: () => void; existing?: Account }) {
  const [v, setV] = useState({
    name: existing?.name ?? '', type: existing?.type ?? 'real_estate', balance: existing?.balance?.toString() ?? '',
    isHidden: existing?.isHidden ?? false, isClosed: existing?.isClosed ?? false,
  })
  const m = useGqlMutation(existing
    ? 'mutation EditAcct($id: ID!, $input: AccountInput!) { editAccount(id: $id, input: $input) { id } }'
    : 'mutation NewAcct($input: AccountInput!) { createAccount(input: $input) { id } }')
  const canEditBalance = !existing || existing.isManual
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const input: Record<string, unknown> = { name: v.name }
    if (canEditBalance && v.balance !== '') input.balance = Number(v.balance)
    if (existing) Object.assign(input, { isHidden: v.isHidden, isClosed: v.isClosed })
    else input.type = v.type
    m.mutate(existing ? { id: existing.id, input } : { input }, { onSuccess: onClose })
  }
  return (
    <Modal title={existing ? 'Edit account' : 'Add manual account'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Name"><input className="input" required autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Home, Car, 401(k)" /></Field>
        {!existing && (
          <Field label="Type">
            <select className="input" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
              {TYPE_ORDER.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}
            </select>
          </Field>
        )}
        {canEditBalance && (
          <Field label={existing ? 'Current balance' : 'Balance'} hint={v.type === 'loan' || v.type === 'credit' ? 'Enter the amount owed as a positive number.' : undefined}>
            <input className="input" type="number" step="0.01" required={!existing} value={v.balance} onChange={(e) => setV({ ...v, balance: e.target.value })} />
          </Field>
        )}
        {existing && (
          <>
            <Toggle checked={v.isHidden} onChange={(isHidden) => setV({ ...v, isHidden })} label="Hide from net worth and sidebar" />
            <Toggle checked={v.isClosed} onChange={(isClosed) => setV({ ...v, isClosed })} label="Mark as closed" />
          </>
        )}
        <ErrorNote error={m.error} />
        <div className="drawer-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={m.isPending}>{existing ? 'Save' : 'Add account'}</button>
        </div>
      </form>
    </Modal>
  )
}

export function AccountDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const openTx = useOpenTransaction()
  const [tf, setTf] = useState<TimeFrame>('THREE_MONTHS')
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const { data, isLoading, error } = useGql<{
    account: (Account & { balanceHistory: { date: string; balance: number }[] }) | null
    transactions: { totalCount: number; edges: { node: Transaction }[] }
    holdings: HoldingRow[]
  }>(
    `query Acct($id: ID!, $tf: TimeFrame) {
      account(id: $id) { ${ACCOUNT_FIELDS} balanceHistory(timeFrame: $tf) { date balance } }
      transactions(first: 100, filter: { accountIds: [$id] }) { totalCount edges { node { ${TX_FIELDS} } } }
      holdings(accountId: $id) { id quantity value averageCost costBasis totalReturn totalReturnPct security { id symbol name type currentPrice change1d } }
    }`,
    { id, tf },
  )
  const del = useGqlMutation('mutation DelAcct($id: ID!) { deleteAccount(id: $id) }')
  if (isLoading) return <Loading />
  const a = data?.account
  if (!a) return <ErrorNote error={error ?? 'Account not found'} />
  const h = a.balanceHistory
  return (
    <div className="page">
      <PageHeader title={<><Link to="/accounts" className="crumb">Accounts</Link> {a.name}</>}>
        <button className="btn" onClick={() => setEditing(true)}>Edit</button>
        {a.isManual && <ConfirmButton onConfirm={() => del.mutate({ id }, { onSuccess: () => nav('/accounts') })}>Delete</ConfirmButton>}
      </PageHeader>
      <ErrorNote error={del.error} />
      <Card title={<>{a.institution}{a.mask ? ` ··${a.mask}` : ''} <span className="muted">· {ACCOUNT_TYPE_LABELS[a.type]}</span></>} action={<TimeFrameTabs value={tf} onChange={setTf} />}>
        <div className="big-stat">
          <div className="big-num">{money(a.balance)}</div>
          <div className="muted">{a.isDebt ? 'Owed' : 'Balance'} · updated {shortDate(a.updatedAt.slice(0, 10))}</div>
        </div>
        {a.limit != null && (
          <div className="utilization">
            <Progress value={a.balance} max={a.limit} />
            <small className="muted">{Math.round((a.balance / a.limit) * 100)}% of {money(a.limit, true)} limit used</small>
          </div>
        )}
        <LineChart height={180} format={(n) => money(n, true)} labels={h.map((p) => shortDate(p.date))}
          series={[{ values: h.map((p) => p.balance), color: a.isDebt ? '#f04242' : '#3d82ff', fill: true }]} />
      </Card>
      {data.holdings.length > 0 && (
        <>
          <h2 className="section-label">Holdings</h2>
          <HoldingsTable holdings={data.holdings} />
        </>
      )}
      <h2 className="section-label row between">
        <span>Transactions ({data.transactions.totalCount})</span>
        <span className="row gap">
          {data.transactions.totalCount > 100 && <Link className="link" to={`/transactions?account=${a.id}`}>View all ›</Link>}
          <button className="btn small" onClick={() => setAdding(true)}>+ Add</button>
        </span>
      </h2>
      <div className="card">
        {data.transactions.edges.length ? <TransactionList transactions={data.transactions.edges.map((e) => e.node)} onOpen={openTx} /> : <Empty>No transactions in this account.</Empty>}
      </div>
      {editing && <AccountModal existing={a} onClose={() => setEditing(false)} />}
      {adding && <AddTransactionModal defaultAccountId={a.id} onClose={() => setAdding(false)} />}
    </div>
  )
}
