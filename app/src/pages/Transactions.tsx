import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useOpenTransaction } from '../components/Layout'
import { AddTransactionModal, TransactionList } from '../components/transactions'
import { CategoryChip, CategoryPicker, ConfirmButton, Empty, ErrorNote, Loading, PageHeader, Popover } from '../components/ui'
import { gql, useGql, useGqlMutation } from '../lib/api'
import { ALL_ACCOUNTS, ALL_CATEGORIES, ALL_TAGS, TX_FIELDS } from '../lib/fragments'
import { downloadText, money, todayStr } from '../lib/format'
import type { AccountLite, CategoryLite, Tag, Transaction } from '../lib/types'

const LIST = `query Txs($first: Int, $filter: TransactionFilter, $sort: [TransactionSort!]) {
  transactions(first: $first, filter: $filter, sort: $sort) { totalCount pageInfo { hasNextPage } edges { node { ${TX_FIELDS} } } }
}`
const BULK = 'mutation Bulk($ids: [ID!]!, $input: BulkEditInput!) { bulkEditTransactions(ids: $ids, input: $input) { updated } }'
const BULK_DELETE = 'mutation BulkDel($ids: [ID!]!) { bulkDeleteTransactions(ids: $ids) { updated } }'

const PAGE = 50

/** Search text waits for a pause in typing before querying. */
function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export default function Transactions() {
  const [params, setParams] = useSearchParams()
  const openTx = useOpenTransaction()
  // Filters live in the URL so they survive reloads and can be linked to.
  const get = (k: string) => params.get(k) ?? ''
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
    setLimit(PAGE)
  }
  const [search, setSearch] = useState(get('q'))
  const q = useDebounced(search)
  useEffect(() => set('q', q), [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const [limit, setLimit] = useState(PAGE)
  const [sort, setSort] = useState('DATE:DESC')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)

  const filter = useMemo(() => {
    const f: Record<string, unknown> = {}
    if (get('q')) f.search = get('q')
    if (get('category')) f.categoryIds = [get('category')]
    if (get('account')) f.accountIds = [get('account')]
    if (get('tag')) f.tagIds = [get('tag')]
    if (get('reviewed')) f.isReviewed = get('reviewed') === 'true'
    if (get('type')) f.types = [get('type')]
    if (get('from')) f.from = get('from')
    if (get('to')) f.to = get('to')
    return f
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  const [field, direction] = sort.split(':')
  const { data, isLoading, isFetching, error } = useGql<{ transactions: { totalCount: number; pageInfo: { hasNextPage: boolean }; edges: { node: Transaction }[] } }>(
    LIST, { first: limit, filter, sort: [{ field, direction }] },
  )
  const cats = useGql<{ allCategories: CategoryLite[] }>(ALL_CATEGORIES)
  const accounts = useGql<{ accounts: AccountLite[] }>(ALL_ACCOUNTS)
  const tags = useGql<{ tags: Tag[] }>(ALL_TAGS)
  const bulk = useGqlMutation(BULK)
  const bulkDelete = useGqlMutation(BULK_DELETE)

  const txs = data?.transactions.edges.map((e) => e.node) ?? []
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const ids = [...selected]
  const doBulk = (input: Record<string, unknown>) => bulk.mutate({ ids, input }, { onSuccess: () => setSelected(new Set()) })
  const active = Object.keys(filter).length > 0
  const category = cats.data?.allCategories.find((c) => c.id === get('category')) ?? null

  const exportCsv = async () => {
    const r = await gql<{ exportTransactions: string }>('query Export($filter: TransactionFilter) { exportTransactions(filter: $filter) }', { filter })
    downloadText(`transactions-${todayStr()}.csv`, r.exportTransactions)
  }

  return (
    <div className="page">
      <PageHeader title="Transactions">
        <button className="btn" onClick={exportCsv}>Export CSV</button>
        <button className="btn primary" onClick={() => setAdding(true)}>+ Add transaction</button>
      </PageHeader>

      <div className="filters">
        <input className="input search" placeholder="Search name or notes" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        <Popover trigger={(open) => (
          <button className="btn filter-btn" onClick={open}>{category ? `${category.emoji} ${category.name}` : 'Category'} ▾</button>
        )}>
          {(close) => <CategoryPicker value={get('category') || null} onChange={(id) => set('category', id ?? '')} onClose={close} allowNone />}
        </Popover>
        <select className="input" value={get('account')} onChange={(e) => set('account', e.target.value)} aria-label="Account">
          <option value="">All accounts</option>
          {accounts.data?.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="input" value={get('reviewed')} onChange={(e) => set('reviewed', e.target.value)} aria-label="Review status">
          <option value="">Any status</option>
          <option value="false">Needs review</option>
          <option value="true">Reviewed</option>
        </select>
        <select className="input" value={get('type')} onChange={(e) => set('type', e.target.value)} aria-label="Type">
          <option value="">All types</option>
          <option value="regular">Spending</option>
          <option value="income">Income</option>
          <option value="internal_transfer">Transfers</option>
        </select>
        <select className="input" value={get('tag')} onChange={(e) => set('tag', e.target.value)} aria-label="Tag">
          <option value="">Any tag</option>
          {tags.data?.tags.map((t) => <option key={t.id} value={t.id}>#{t.name}</option>)}
        </select>
        <input className="input" type="date" value={get('from')} onChange={(e) => set('from', e.target.value)} aria-label="From date" />
        <input className="input" type="date" value={get('to')} onChange={(e) => set('to', e.target.value)} aria-label="To date" />
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="DATE:DESC">Newest first</option>
          <option value="DATE:ASC">Oldest first</option>
          <option value="AMOUNT:DESC">Largest first</option>
          <option value="AMOUNT:ASC">Smallest first</option>
          <option value="NAME:ASC">Name A–Z</option>
        </select>
        {active && <button className="btn link" onClick={() => { setSearch(''); setParams({}, { replace: true }) }}>Clear filters</button>}
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <b>{selected.size} selected</b>
          <Popover trigger={(open) => <button className="btn small" onClick={open}>Categorize ▾</button>}>
            {(close) => <CategoryPicker value={null} onChange={(categoryId) => doBulk({ categoryId, isReviewed: true })} onClose={close} />}
          </Popover>
          <button className="btn small" onClick={() => doBulk({ isReviewed: true })}>Mark reviewed</button>
          <button className="btn small" onClick={() => doBulk({ isReviewed: false })}>Mark unreviewed</button>
          <select className="input small" value="" onChange={(e) => e.target.value && doBulk({ addTagIds: [e.target.value] })} aria-label="Add tag">
            <option value="">Add tag…</option>
            {tags.data?.tags.map((t) => <option key={t.id} value={t.id}>#{t.name}</option>)}
          </select>
          <ConfirmButton className="btn small danger" onConfirm={() => bulkDelete.mutate({ ids }, { onSuccess: () => setSelected(new Set()) })}>Delete</ConfirmButton>
          <button className="btn small link" onClick={() => setSelected(new Set())}>Cancel</button>
        </div>
      )}
      <ErrorNote error={error ?? bulk.error ?? bulkDelete.error} />

      {isLoading ? <Loading /> : (
        <div className="card">
          <div className="list-head">
            <label className="row gap">
              <input type="checkbox" aria-label="Select all shown" checked={txs.length > 0 && txs.every((t) => selected.has(t.id))}
                onChange={(e) => setSelected(e.target.checked ? new Set(txs.map((t) => t.id)) : new Set())} />
              <span className="muted">{data?.transactions.totalCount ?? 0} transactions</span>
            </label>
            {category && <CategoryChip category={category} />}
            <span className="muted">
              Spending shown: {money(txs.filter((t) => t.type === 'regular').reduce((s, t) => s + t.amount, 0))}
              {isFetching && ' · updating…'}
            </span>
          </div>
          {txs.length === 0 ? <Empty>No transactions match these filters.</Empty> : (
            <TransactionList transactions={txs} onOpen={openTx} selected={selected} onToggle={toggle} />
          )}
          {data?.transactions.pageInfo.hasNextPage && (
            <button className="btn wide" onClick={() => setLimit((l) => l + PAGE)} disabled={isFetching}>Load more</button>
          )}
        </div>
      )}
      {adding && <AddTransactionModal onClose={() => setAdding(false)} defaultAccountId={get('account') || undefined} />}
    </div>
  )
}
