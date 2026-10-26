export type TimeFrame = 'ONE_WEEK' | 'ONE_MONTH' | 'THREE_MONTHS' | 'YTD' | 'ONE_YEAR' | 'ALL'
export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semiannually' | 'yearly'

export type CategoryLite = { id: string; name: string; emoji: string; color: string; parentId: string | null; isExcluded: boolean }
export type Tag = { id: string; name: string; color: string }
export type AccountLite = { id: string; name: string; institution: string | null; mask: string | null; color: string; type: string }

export type Transaction = {
  id: string
  date: string
  name: string
  amount: number
  type: 'regular' | 'income' | 'internal_transfer'
  isReviewed: boolean
  isPending: boolean
  isSplit: boolean
  notes: string | null
  category: CategoryLite | null
  account: AccountLite
  recurring: { id: string; name: string; emoji: string } | null
  tags: Tag[]
}

export type MonthlySpend = { month: string; amount: number; comparisonAmount: number; paidRecurringAmount: number; unpaidRecurringAmount: number }
export type MonthlyBudget = { month: string; amount: number; rolloverAmount: number; childAmount: number; childRolloverAmount: number; resolvedAmount: number }

export type Account = AccountLite & {
  subType: string | null
  balance: number
  limit: number | null
  isManual: boolean
  isHidden: boolean
  isClosed: boolean
  isDebt: boolean
  updatedAt: string
  change3m: number | null
}

export type Recurring = {
  id: string
  name: string
  emoji: string
  frequency: Frequency
  state: 'active' | 'paused' | 'archived'
  nextPaymentDate: string | null
  nextPaymentAmount: number | null
  category: CategoryLite | null
  rule: { nameContains: string; minAmount: number | null; maxAmount: number | null }
}
