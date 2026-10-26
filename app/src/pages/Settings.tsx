import { useState } from 'react'
import { Link } from 'react-router'
import { TagPill } from '../components/transactions'
import { Card, ColorPicker, ConfirmButton, Empty, ErrorNote, PageHeader } from '../components/ui'
import { gql, useGql, useGqlMutation } from '../lib/api'
import { ALL_TAGS } from '../lib/fragments'
import { downloadText, todayStr } from '../lib/format'
import type { Tag } from '../lib/types'

export default function Settings() {
  const { data } = useGql<{ tags: Tag[] }>(ALL_TAGS)
  const create = useGqlMutation('mutation NewTag($input: TagInput!) { createTag(input: $input) { id } }')
  const edit = useGqlMutation('mutation EditTag($id: ID!, $input: TagInput!) { editTag(id: $id, input: $input) { id } }')
  const del = useGqlMutation('mutation DelTag($id: ID!) { deleteTag(id: $id) }')
  const [name, setName] = useState('')
  const [color, setColor] = useState('blue')

  const exportAll = async () => {
    const r = await gql<{ exportTransactions: string }>('query { exportTransactions }')
    downloadText(`all-transactions-${todayStr()}.csv`, r.exportTransactions)
  }

  return (
    <div className="page narrow">
      <PageHeader title="Settings" />
      <Card title="Tags">
        <p className="muted">Tags group transactions across categories, like a trip or work expenses.</p>
        <form className="row gap wrap" onSubmit={(e) => { e.preventDefault(); create.mutate({ input: { name, color } }, { onSuccess: () => setName('') }) }}>
          <input className="input" required placeholder="New tag name" value={name} onChange={(e) => setName(e.target.value)} />
          <ColorPicker value={color} onChange={setColor} />
          <button className="btn primary" disabled={create.isPending}>Add tag</button>
        </form>
        <ErrorNote error={create.error ?? edit.error ?? del.error} />
        <div className="list">
          {(data?.tags ?? []).length === 0 && <Empty>No tags yet.</Empty>}
          {data?.tags.map((t) => (
            <div key={t.id} className="list-row static">
              <Link to={`/transactions?tag=${t.id}`} className="grow"><TagPill tag={t} /></Link>
              <ColorPicker value={t.color} onChange={(c) => edit.mutate({ id: t.id, input: { color: c } })} />
              <ConfirmButton className="btn small danger" onConfirm={() => del.mutate({ id: t.id })}>Delete</ConfirmButton>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Your data">
        <p className="muted">Download every transaction as a spreadsheet-friendly CSV file.</p>
        <button className="btn" onClick={exportAll}>Export all transactions</button>
      </Card>
      <Card title="About">
        <p className="muted">
          This app runs on mock data from a local database (<code>server/data/finance.db</code>). To start over with fresh demo data,
          stop the API and run <code>npm run seed</code> in <code>server/</code>.
        </p>
      </Card>
    </div>
  )
}
