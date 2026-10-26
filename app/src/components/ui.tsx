import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useGql } from '../lib/api'
import { ALL_CATEGORIES } from '../lib/fragments'
import { colorOf } from '../lib/format'
import type { CategoryLite, TimeFrame } from '../lib/types'

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          <h3>{title}</h3>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function PageHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      <div className="page-actions">{children}</div>
    </header>
  )
}

export const Loading = () => <div className="loading" aria-label="Loading"><span /><span /><span /></div>
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>
export const ErrorNote = ({ error }: { error: unknown }) =>
  error ? <div className="error-note">{error instanceof Error ? error.message : String(error)}</div> : null

export function CategoryChip({ category, onClick }: { category: Pick<CategoryLite, 'name' | 'emoji' | 'color'> | null; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'span'
  if (!category)
    return <Tag className="chip chip-empty" onClick={onClick} type={onClick ? 'button' : undefined}>Uncategorized</Tag>
  const c = colorOf(category.color)
  return (
    <Tag className="chip" style={{ color: c, background: `${c}22` }} onClick={onClick} type={onClick ? 'button' : undefined}>
      <span aria-hidden>{category.emoji}</span>
      {category.name.toUpperCase()}
    </Tag>
  )
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEscape(onClose)
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        {children}
      </div>
    </div>
  )
}

export function Drawer({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEscape(onClose)
  return (
    <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal aria-label={label}>
        <button className="icon-btn drawer-close" onClick={onClose} aria-label="Close">✕</button>
        {children}
      </aside>
    </div>
  )
}

function useEscape(fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && fn()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [fn])
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <i />
      <span>{label}</span>
    </button>
  )
}

const TF: [TimeFrame, string][] = [['ONE_WEEK', '1W'], ['ONE_MONTH', '1M'], ['THREE_MONTHS', '3M'], ['YTD', 'YTD'], ['ONE_YEAR', '1Y'], ['ALL', 'ALL']]
export function TimeFrameTabs({ value, onChange }: { value: TimeFrame; onChange: (t: TimeFrame) => void }) {
  return (
    <div className="segmented" role="tablist">
      {TF.map(([v, l]) => (
        <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map(([v, l]) => (
        <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  )
}

/** Asks once ("Delete?" → "Confirm") before running a destructive action. */
export function ConfirmButton({ onConfirm, children, className = 'btn danger' }: { onConfirm: () => void; children: ReactNode; className?: string }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button type="button" className={className} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? 'Click again to confirm' : children}
    </button>
  )
}

/** Searchable category menu. Suggested categories (from this merchant's history) show first. */
export function CategoryPicker({
  value, onChange, suggested = [], allowNone = true, onClose,
}: {
  value: string | null
  onChange: (id: string | null) => void
  suggested?: CategoryLite[]
  allowNone?: boolean
  onClose?: () => void
}) {
  const { data } = useGql<{ allCategories: CategoryLite[] }>(ALL_CATEGORIES)
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  const groups = useMemo(() => {
    const all = data?.allCategories ?? []
    const match = (c: CategoryLite) => c.name.toLowerCase().includes(q.toLowerCase())
    return all
      .filter((c) => !c.parentId)
      .map((p) => ({ parent: p, children: all.filter((c) => c.parentId === p.id && (match(c) || match(p))) }))
      .filter((g) => match(g.parent) || g.children.length)
  }, [data, q])
  const pick = (id: string | null) => {
    onChange(id)
    onClose?.()
  }
  return (
    <div className="picker" onKeyDown={(e) => e.key === 'Escape' && onClose?.()}>
      <input ref={inputRef} className="input" placeholder="Search categories" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="picker-list">
        {!q && suggested.length > 0 && (
          <div className="picker-group">
            <div className="picker-label">Suggested</div>
            {suggested.map((c) => (
              <button key={c.id} className="picker-item" onClick={() => pick(c.id)}>
                <span>{c.emoji}</span> {c.name}
              </button>
            ))}
          </div>
        )}
        {groups.map(({ parent, children }) => (
          <div className="picker-group" key={parent.id}>
            <button className={`picker-item parent ${value === parent.id ? 'sel' : ''}`} onClick={() => pick(parent.id)}>
              <span>{parent.emoji}</span> {parent.name}
            </button>
            {children.map((c) => (
              <button key={c.id} className={`picker-item child ${value === c.id ? 'sel' : ''}`} onClick={() => pick(c.id)}>
                <span>{c.emoji}</span> {c.name}
              </button>
            ))}
          </div>
        ))}
        {allowNone && <button className="picker-item muted" onClick={() => pick(null)}>No category</button>}
      </div>
    </div>
  )
}

/** A button that opens a floating panel below it; closes on outside click. */
export function Popover({ trigger, children }: { trigger: (open: () => void) => ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div className="popover-wrap" ref={ref}>
      {trigger(() => setOpen((o) => !o))}
      {open && <div className="popover">{children(() => setOpen(false))}</div>}
    </div>
  )
}

export const EMOJI_CHOICES = ['🍔', '🥑', '☕️', '🥟', '🏠', '🔑', '⚡️', '☂️', '📱', '🚙', '🚕', '⛽️', '🚇', '🛍️', '👕', '🛋️', '📦', '🎉', '🍿', '📺', '✈️', '💪', '🏋️', '💊', '💰', '🎁', '🐶', '👶', '🎓', '💼', '🧾', '🎮', '🍷', '💇', '🧹', '🔁']
export function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  return (
    <div className="emoji-grid">
      {EMOJI_CHOICES.map((e) => (
        <button type="button" key={e} className={e === value ? 'sel' : ''} onClick={() => onChange(e)}>{e}</button>
      ))}
    </div>
  )
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="color-row">
      {['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'gray'].map((c) => (
        <button type="button" key={c} aria-label={c} className={c === value ? 'sel' : ''} style={{ background: colorOf(c) }} onClick={() => onChange(c)} />
      ))}
    </div>
  )
}
