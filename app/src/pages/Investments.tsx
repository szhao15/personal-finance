import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { LineChart } from '../components/charts'
import { Card, ErrorNote, Loading, PageHeader, Segmented, TimeFrameTabs } from '../components/ui'
import { useGql } from '../lib/api'
import { money, pct, shortDate } from '../lib/format'
import type { TimeFrame } from '../lib/types'

export type HoldingRow = {
  id: string; quantity: number; value: number; averageCost: number; costBasis: number; totalReturn: number; totalReturnPct: number
  security: { id: string; symbol: string; name: string; type: string; currentPrice: number; change1d: number }
  account?: { id: string; name: string }
}

const TYPE_LABEL: Record<string, string> = { equity: 'Stocks', etf: 'ETFs', crypto: 'Crypto', mutual_fund: 'Mutual funds', cash: 'Cash' }
const TYPE_COLOR: Record<string, string> = { equity: '#3d82ff', etf: '#40bf40', crypto: '#ff8833', mutual_fund: '#9a5cf0', cash: '#7f8ba4' }

export function HoldingsTable({ holdings }: { holdings: HoldingRow[] }) {
  return (
    <div className="card table-wrap">
      <table className="table">
        <thead>
          <tr><th>Holding</th><th>Price</th><th>Today</th><th>Quantity</th><th>Value</th><th>Total return</th></tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr key={h.id}>
              <td>
                <Link to={`/investments/h/${h.security.id}`} className="holding-name">
                  <b>{h.security.symbol}</b>
                  <small className="muted ellipsis">{h.security.name}{h.account ? ` · ${h.account.name}` : ''}</small>
                </Link>
              </td>
              <td>{money(h.security.currentPrice)}</td>
              <td><span className={`delta ${h.security.change1d >= 0 ? 'up' : 'down'}`}>{pct(h.security.change1d)}</span></td>
              <td>{h.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
              <td><b>{money(h.value)}</b></td>
              <td className={h.totalReturn >= 0 ? 'good' : 'bad'}>{money(h.totalReturn)} <small>({pct(h.totalReturnPct)})</small></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Investments() {
  const [tf, setTf] = useState<TimeFrame>('THREE_MONTHS')
  const [view, setView] = useState<'balance' | 'performance'>('balance')
  const { data, isLoading, error } = useGql<{
    investmentBalance: { date: string; balance: number }[]
    investmentPerformance: { date: string; performance: number }[]
    investmentAllocation: { type: string; amount: number; percentage: number }[]
    topMovers: { change: number; security: { id: string; symbol: string; name: string } }[]
    holdings: HoldingRow[]
  }>(
    `query Inv($tf: TimeFrame) {
      investmentBalance(timeFrame: $tf) { date balance }
      investmentPerformance(timeFrame: $tf) { date performance }
      investmentAllocation { type amount percentage }
      topMovers { change security { id symbol name } }
      holdings { id quantity value averageCost costBasis totalReturn totalReturnPct account { id name } security { id symbol name type currentPrice change1d } }
    }`,
    { tf },
  )
  if (isLoading) return <Loading />
  if (!data) return <ErrorNote error={error} />
  const b = data.investmentBalance
  const p = data.investmentPerformance
  const perf = p.at(-1)?.performance ?? 0
  const gain = (b.at(-1)?.balance ?? 0) - (b[0]?.balance ?? 0)
  const totalReturn = data.holdings.reduce((s, h) => s + h.totalReturn, 0)
  const up = perf >= 0

  return (
    <div className="page">
      <PageHeader title="Investments" />
      <Card
        title={<Segmented value={view} onChange={setView} options={[['balance', 'Balance'], ['performance', 'Performance']]} />}
        action={<TimeFrameTabs value={tf} onChange={setTf} />}
      >
        <div className="big-stat">
          <div className="big-num">{money(b.at(-1)?.balance ?? 0)}</div>
          <div>
            <span className={`delta ${up ? 'up' : 'down'}`}>{pct(perf)}</span>{' '}
            <span className="muted">{gain >= 0 ? '+' : ''}{money(gain)} this period · {money(totalReturn)} all-time return</span>
          </div>
        </div>
        {view === 'balance' ? (
          <LineChart height={220} format={(n) => money(n, true)} labels={b.map((x) => shortDate(x.date))}
            series={[{ values: b.map((x) => x.balance), color: up ? '#40bf40' : '#f04242', fill: true, label: 'Balance' }]} />
        ) : (
          <LineChart height={220} format={pct} labels={p.map((x) => shortDate(x.date))} baseline={{ value: 0, label: '0%' }}
            series={[{ values: p.map((x) => x.performance), color: up ? '#40bf40' : '#f04242', fill: true, label: 'Return' }]} />
        )}
      </Card>
      <div className="detail-grid">
        <Card title="Allocation">
          <div className="alloc-bar">
            {data.investmentAllocation.map((a) => <span key={a.type} style={{ width: `${a.percentage}%`, background: TYPE_COLOR[a.type] }} title={TYPE_LABEL[a.type]} />)}
          </div>
          <div className="list">
            {data.investmentAllocation.map((a) => (
              <div key={a.type} className="list-row static">
                <span className="dot" style={{ background: TYPE_COLOR[a.type] }} />
                <span className="grow">{TYPE_LABEL[a.type] ?? a.type}</span>
                <span className="muted">{a.percentage.toFixed(1)}%</span>
                <b>{money(a.amount, true)}</b>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Top movers today">
          <div className="list">
            {data.topMovers.map((m) => (
              <Link key={m.security.id} to={`/investments/h/${m.security.id}`} className="list-row">
                <b className="ticker">{m.security.symbol}</b>
                <span className="grow muted ellipsis">{m.security.name}</span>
                <span className={`delta ${m.change >= 0 ? 'up' : 'down'}`}>{pct(m.change)}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
      <h2 className="section-label">Holdings</h2>
      <HoldingsTable holdings={data.holdings} />
    </div>
  )
}

export function SecurityDetail() {
  const { id } = useParams()
  const [tf, setTf] = useState<TimeFrame>('THREE_MONTHS')
  const { data, isLoading, error } = useGql<{
    security: { id: string; symbol: string; name: string; type: string; currentPrice: number; change1d: number; prices: { date: string; price: number }[] } | null
    holdings: HoldingRow[]
  }>(
    `query Sec($id: ID!, $tf: TimeFrame) {
      security(id: $id) { id symbol name type currentPrice change1d prices(timeFrame: $tf) { date price } }
      holdings { id quantity value averageCost costBasis totalReturn totalReturnPct account { id name } security { id symbol name type currentPrice change1d } }
    }`,
    { id, tf },
  )
  if (isLoading) return <Loading />
  const s = data?.security
  if (!s) return <ErrorNote error={error ?? 'Security not found'} />
  const pr = s.prices
  const change = pr.length > 1 ? ((pr.at(-1)!.price - pr[0].price) / pr[0].price) * 100 : 0
  const mine = data.holdings.filter((h) => h.security.id === s.id)
  return (
    <div className="page">
      <PageHeader title={<><Link to="/investments" className="crumb">Investments</Link> {s.symbol} <span className="muted">{s.name}</span></>} />
      <Card title={TYPE_LABEL[s.type] ?? s.type} action={<TimeFrameTabs value={tf} onChange={setTf} />}>
        <div className="big-stat">
          <div className="big-num">{money(s.currentPrice)}</div>
          <div><span className={`delta ${change >= 0 ? 'up' : 'down'}`}>{pct(change)}</span> <span className="muted">this period · {pct(s.change1d)} today</span></div>
        </div>
        <LineChart height={220} format={(n) => money(n)} labels={pr.map((x) => shortDate(x.date))}
          series={[{ values: pr.map((x) => x.price), color: change >= 0 ? '#40bf40' : '#f04242', fill: true, label: s.symbol }]} />
      </Card>
      {mine.length > 0 && (
        <>
          <h2 className="section-label">Your position</h2>
          <div className="detail-grid">
            {mine.map((h) => (
              <Card key={h.id} title={h.account?.name}>
                <div className="stat-row">
                  <div><small className="muted">VALUE</small><b>{money(h.value)}</b></div>
                  <div><small className="muted">QUANTITY</small><b>{h.quantity}</b></div>
                  <div><small className="muted">AVG COST</small><b>{money(h.averageCost)}</b></div>
                  <div><small className="muted">RETURN</small><b className={h.totalReturn >= 0 ? 'good' : 'bad'}>{money(h.totalReturn)} ({pct(h.totalReturnPct)})</b></div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
