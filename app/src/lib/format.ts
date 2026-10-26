const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export const money = (n: number, whole = false) => (whole ? usd0 : usd).format(n)
/** Transactions: spending shows plain, income/refunds show with a plus. */
export const txMoney = (n: number) => (n < 0 ? `+${usd.format(-n)}` : usd.format(n))
export const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`

// Date strings are 'YYYY-MM-DD'; parse as local dates so they don't shift a day.
export const parseDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const todayStr = () => new Date().toLocaleDateString('en-CA')
export const thisMonth = () => todayStr().slice(0, 7)
export const shiftMonth = (month: string, n: number) => {
  const d = parseDate(`${month}-01`)
  d.setMonth(d.getMonth() + n)
  return d.toLocaleDateString('en-CA').slice(0, 7)
}
export const monthLabel = (month: string, long = true) =>
  parseDate(`${month}-01`).toLocaleDateString('en-US', long ? { month: 'long', year: 'numeric' } : { month: 'short' })
const sameYear = (s: string) => s.slice(0, 4) === todayStr().slice(0, 4)
export const shortDate = (s: string) =>
  parseDate(s).toLocaleDateString('en-US', sameYear(s) ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })

export function dayLabel(s: string) {
  const t = todayStr()
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (s === t) return 'Today'
  if (s === y.toLocaleDateString('en-CA')) return 'Yesterday'
  return parseDate(s).toLocaleDateString('en-US', sameYear(s) ? { weekday: 'long', month: 'long', day: 'numeric' } : { month: 'long', day: 'numeric', year: 'numeric' })
}

export const COLORS: Record<string, string> = {
  red: '#f04242', orange: '#ff8833', yellow: '#e1b321', green: '#40bf40', teal: '#22c7b8', blue: '#3d82ff',
  purple: '#9a5cf0', pink: '#ff4fae', brown: '#c08635', gray: '#7f8ba4',
}
export const colorOf = (name?: string | null) => (name && (COLORS[name] ?? (name.startsWith('#') ? name : undefined))) || COLORS.gray

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  depository: 'Cash', credit: 'Credit cards', investment: 'Investments', loan: 'Loans', real_estate: 'Real estate', other: 'Other',
}
export const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', quarterly: 'Quarterly', semiannually: 'Every 6 months', yearly: 'Yearly',
}

export function downloadText(filename: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
