import { useState } from 'react'
import { Link } from 'react-router'
import { LineChart, Ring } from '../components/charts'
import { useOpenTransaction } from '../components/Layout'
import { TransactionList } from '../components/transactions'
import { Card, Empty, ErrorNote, Loading, PageHeader, TimeFrameTabs } from '../components/ui'
import { useGql, useGqlMutation } from '../lib/api'
import { CATEGORY_LITE, TX_FIELDS } from '../lib/fragments'
import { dayLabel, money, monthLabel, pct, shortDate, thisMonth } from '../lib/format'
import type { CategoryLite, MonthlyBudget, MonthlySpend, TimeFrame, Transaction } from '../lib/types'

const DASH = `query Dashboard {
  spendingLine { budget days { day current previous } }
  categoriesTotal { spend { amount comparisonAmount } budget { resolvedAmount } }
  categories { ${CATEGORY_LITE} spend { amount } budget { resolvedAmount } }
  toReview: transactions(first: 8, filter: { isReviewed: false }) { totalCount edges { node { ${TX_FIELDS} } } }
  upcomingRecurrings(days: 14) { date amount recurring { id name emoji } }
  suggestedRecurrings { name }
}`

type DashData = {
  spendingLine: { budget: number; days: { day: number; current: number | null; previous: number }[] }
  categoriesTotal: { spend: MonthlySpend; budget: MonthlyBudget }
  categories: (CategoryLite & { spend: MonthlySpend; budget: MonthlyBudget })[]
  toReview: { totalCount: number; edges: { node: Transaction }[] }
  upcomingRecurrings: { date: string; amount: number; recurring: { id: string; name: string; emoji: string } }[]
  suggestedRecurrings: { name: string }[]
}

export default function Dashboard() {
  const { data, isLoading, error } = useGql<DashData>(DASH)
  const openTx = useOpenTransaction()
  const markReviewed = useGqlMutation('mutation Bulk($ids: [ID!]!) { bulkEditTransactions(ids: $ids, input: { isReviewed: true }) { updated } }')

  if (isLoading) return <Loading />
  if (!data) return <ErrorNote error={error} />

  const spent = data.categoriesTotal.spend.amount
  const budget = data.categoriesTotal.budget.resolvedAmount
  const left = budget - spent
  const review = data.toReview.edges.map((e) => e.node)
  const budgeted = data.categories.filter((c) => !c.isExcluded && c.budget.resolvedAmount > 0)

  return (
    <div className="page">
      <PageHeader title="Dashboard" />
      {data.suggestedRecurrings.length > 0 && (
        <Link to="/recurrings" className="banner">
          ↻ We found {data.suggestedRecurrings.length} recurring charges you aren't tracking yet. <b>Review them ›</b>
        </Link>
      )}
      <div className="dash-grid">
        <Card title="Monthly spending" action={<Link to="/transactions" className="link">Transactions ›</Link>}>
          <div className="big-stat">
            <div className="big-num">{money(spent, true)} <small>spent</small></div>
            <div className="muted">
              {money(data.categoriesTotal.spend.comparisonAmount, true)} by this point last month ·{' '}
              {budget > 0 && <span className={left >= 0 ? 'good' : 'bad'}>{money(Math.abs(left), true)} {left >= 0 ? 'left' : 'over'}</span>}
            </div>
          </div>
          <LineChart
            height={170}
            format={(n) => money(n, true)}
            labels={data.spendingLine.days.map((d) => `${monthLabel(thisMonth(), false)} ${d.day}`)}
            series={[
              { values: data.spendingLine.days.map((d) => d.previous), color: '#5c6f8a', dashed: true, label: 'Last month' },
              { values: data.spendingLine.days.map((d) => d.current), color: left >= 0 ? '#40bf40' : '#f04242', fill: true, label: 'This month' },
            ]}
          />
        </Card>

        <NetWorthCard />

        <Card
          title={<>Transactions to review <span className="count">{data.toReview.totalCount}</span></>}
          action={<Link to="/transactions?reviewed=false" className="link">View all ›</Link>}
        >
          {review.length === 0 ? (
            <Empty>All caught up. 🎉</Empty>
          ) : (
            <>
              <TransactionList transactions={review} onOpen={openTx} compact />
              <button className="btn wide" disabled={markReviewed.isPending} onClick={() => markReviewed.mutate({ ids: review.map((t) => t.id) })}>
                ✓ Mark {review.length} as reviewed
              </button>
            </>
          )}
        </Card>

        <Card title="Budgets" action={<Link to="/categories" className="link">Categories ›</Link>}>
          <div className="budget-rings">
            {budgeted.map((c) => {
              const l = c.budget.resolvedAmount - c.spend.amount
              return (
                <Link key={c.id} to={`/categories/${c.id}`} className="budget-ring">
                  <Ring spent={c.spend.amount} budget={c.budget.resolvedAmount} size={54}>{c.emoji}</Ring>
                  <b>{money(Math.abs(l), true)}</b>
                  <small className="muted">{l >= 0 ? 'left' : 'over'}</small>
                  <small className="ellipsis">{c.name}</small>
                </Link>
              )
            })}
          </div>
        </Card>

        <Card title="Next two weeks" action={<Link to="/recurrings" className="link">Recurrings ›</Link>}>
          {data.upcomingRecurrings.length === 0 ? <Empty>Nothing due in the next two weeks.</Empty> : (
            <div className="list">
              {data.upcomingRecurrings.map((u) => (
                <Link key={u.recurring.id} to={`/recurrings/${u.recurring.id}`} className="list-row">
                  <span className="emoji">{u.recurring.emoji}</span>
                  <span className="grow">{u.recurring.name}<small className="muted block">{dayLabel(u.date)}</small></span>
                  <b>{money(u.amount)}</b>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <InvestmentsCard />
      </div>
    </div>
  )
}

function NetWorthCard() {
  const [tf, setTf] = useState<TimeFrame>('THREE_MONTHS')
  const { data } = useGql<{ networthHistory: { date: string; total: number; assets: number; debt: number }[] }>(
    'query NW($tf: TimeFrame) { networthHistory(timeFrame: $tf) { date total assets debt } }', { tf },
  )
  const h = data?.networthHistory ?? []
  const last = h.at(-1)
  const change = h.length > 1 ? ((last!.total - h[0].total) / Math.abs(h[0].total || 1)) * 100 : 0
  return (
    <Card title="Net worth" action={<Link to="/accounts" className="link">Accounts ›</Link>}>
      {last ? (
        <>
          <div className="big-stat">
            <div className="big-num">{money(last.total, true)}</div>
            <div><span className={`delta ${change >= 0 ? 'up' : 'down'}`}>{pct(change)}</span> <span className="muted">{money(last.assets, true)} assets · {money(last.debt, true)} debt</span></div>
          </div>
          <LineChart height={150} format={(n) => money(n, true)} labels={h.map((p) => shortDate(p.date))}
            series={[{ values: h.map((p) => p.total), color: '#3d82ff', fill: true, label: 'Net worth' }]} />
          <TimeFrameTabs value={tf} onChange={setTf} />
        </>
      ) : <Loading />}
    </Card>
  )
}

function InvestmentsCard() {
  const { data } = useGql<{ investmentBalance: { date: string; balance: number }[]; topMovers: { change: number; security: { id: string; symbol: string } }[] }>(
    'query InvDash { investmentBalance(timeFrame: ONE_MONTH) { date balance } topMovers { change security { id symbol } } }',
  )
  const b = data?.investmentBalance ?? []
  if (!b.length) return null
  const change = ((b.at(-1)!.balance - b[0].balance) / b[0].balance) * 100
  return (
    <Card title="Investments" action={<Link to="/investments" className="link">Investments ›</Link>}>
      <div className="big-stat">
        <div className="big-num">{money(b.at(-1)!.balance, true)}</div>
        <div><span className={`delta ${change >= 0 ? 'up' : 'down'}`}>{pct(change)}</span> <span className="muted">past month</span></div>
      </div>
      <LineChart height={110} format={(n) => money(n, true)} labels={b.map((p) => shortDate(p.date))}
        series={[{ values: b.map((p) => p.balance), color: change >= 0 ? '#40bf40' : '#f04242', fill: true }]} />
      <div className="movers">
        {data!.topMovers.slice(0, 4).map((m) => (
          <Link key={m.security.id} to={`/investments/h/${m.security.id}`} className="mover">
            <b>{m.security.symbol}</b>
            <span className={`delta ${m.change >= 0 ? 'up' : 'down'}`}>{pct(m.change)}</span>
          </Link>
        ))}
      </div>
    </Card>
  )
}
