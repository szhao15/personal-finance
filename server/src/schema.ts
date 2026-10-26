export const typeDefs = /* GraphQL */ `
  enum TimeFrame { ONE_WEEK ONE_MONTH THREE_MONTHS YTD ONE_YEAR ALL }
  enum AccountType { depository credit investment loan real_estate other }
  enum TransactionType { regular income internal_transfer }
  enum Frequency { weekly biweekly monthly quarterly semiannually yearly }
  enum RecurringState { active paused archived }
  enum SortDirection { ASC DESC }
  enum TransactionSortField { DATE AMOUNT NAME }

  type Account {
    id: ID!
    name: String!
    type: AccountType!
    subType: String
    institution: String
    mask: String
    color: String!
    balance: Float!
    limit: Float
    isManual: Boolean!
    isHidden: Boolean!
    isClosed: Boolean!
    isDebt: Boolean!
    updatedAt: String!
    balanceHistory(timeFrame: TimeFrame = THREE_MONTHS): [BalancePoint!]!
    "Net change in balance over the last 3 months, as a percentage."
    change3m: Float
  }
  type BalancePoint { date: String! balance: Float! }

  type Category {
    id: ID!
    name: String!
    emoji: String!
    color: String!
    parentId: ID
    isExcluded: Boolean!
    rolloverEnabled: Boolean!
    canBeDeleted: Boolean!
    childCategories: [Category!]!
    spend(month: String): MonthlySpend!
    spendHistory(months: Int = 6): [MonthlySpend!]!
    budget(month: String): MonthlyBudget!
    budgetHistory(months: Int = 6): [MonthlyBudget!]!
    keyMetrics: KeyMetrics!
  }
  type MonthlySpend { id: ID! month: String! amount: Float! comparisonAmount: Float! paidRecurringAmount: Float! unpaidRecurringAmount: Float! }
  type MonthlyBudget { id: ID! month: String! amount: Float! rolloverAmount: Float! childAmount: Float! childRolloverAmount: Float! resolvedAmount: Float! }
  type KeyMetrics { averageMonthlySpent: Float! totalSpent: Float! year: Int! }
  type CategoriesTotal {
    spend(month: String): MonthlySpend!
    spendHistory(months: Int = 6): [MonthlySpend!]!
    budget(month: String): MonthlyBudget!
    keyMetrics: KeyMetrics!
  }

  type Tag { id: ID! name: String! color: String! }

  type Transaction {
    id: ID!
    date: String!
    name: String!
    amount: Float!
    type: TransactionType!
    accountId: ID!
    account: Account!
    categoryId: ID
    category: Category
    recurringId: ID
    recurring: Recurring
    parentId: ID
    splits: [Transaction!]!
    isSplit: Boolean!
    isReviewed: Boolean!
    isPending: Boolean!
    notes: String
    tags: [Tag!]!
    suggestedCategories: [Category!]!
    createdAt: String!
  }
  type TransactionEdge { cursor: String! node: Transaction! }
  type PageInfo { endCursor: String hasNextPage: Boolean! }
  type TransactionConnection { edges: [TransactionEdge!]! pageInfo: PageInfo! totalCount: Int! }
  input TransactionFilter {
    search: String
    categoryIds: [ID!]
    accountIds: [ID!]
    tagIds: [ID!]
    recurringId: ID
    types: [TransactionType!]
    isReviewed: Boolean
    from: String
    to: String
    minAmount: Float
    maxAmount: Float
  }
  input TransactionSort { field: TransactionSortField! direction: SortDirection! }

  type RecurringRule { nameContains: String! minAmount: Float maxAmount: Float }
  type RecurringPayment { date: String! amount: Float! isPaid: Boolean! }
  type RecurringKeyMetrics { averageTransactionAmount: Float! totalSpent: Float! count: Int! }
  type Recurring {
    id: ID!
    name: String!
    emoji: String!
    categoryId: ID
    category: Category
    frequency: Frequency!
    state: RecurringState!
    rule: RecurringRule!
    nextPaymentDate: String
    nextPaymentAmount: Float
    payments(from: String, to: String): [RecurringPayment!]!
    transactions: [Transaction!]!
    keyMetrics: RecurringKeyMetrics!
  }
  type UpcomingPayment { recurring: Recurring! date: String! amount: Float! }
  type SuggestedRecurring {
    name: String!
    frequency: Frequency!
    category: Category
    ruleNameContains: String!
    minAmount: Float
    maxAmount: Float
    transactionCount: Int!
    averageAmount: Float!
    lastDate: String!
  }

  type NetworthPoint { date: String! assets: Float! debt: Float! total: Float! }
  type Security { id: ID! symbol: String! name: String! type: String! currentPrice: Float! change1d: Float! prices(timeFrame: TimeFrame = ONE_MONTH): [PricePoint!]! }
  type PricePoint { date: String! price: Float! }
  type Holding {
    id: ID!
    account: Account!
    security: Security!
    quantity: Float!
    value: Float!
    averageCost: Float!
    costBasis: Float!
    totalReturn: Float!
    totalReturnPct: Float!
  }
  type Allocation { id: ID! type: String! amount: Float! percentage: Float! }
  type TopMover { security: Security! change: Float! }
  type PerformancePoint { date: String! performance: Float! }

  "Cumulative spend by day of month, this month vs last month, for the spending line."
  type SpendingLine { month: String! budget: Float! days: [SpendingDay!]! }
  type SpendingDay { day: Int! current: Float previous: Float! }

  type Query {
    transactions(first: Int = 50, after: String, filter: TransactionFilter, sort: [TransactionSort!]): TransactionConnection!
    transaction(id: ID!): Transaction
    exportTransactions(filter: TransactionFilter): String!

    categories: [Category!]!
    allCategories: [Category!]!
    category(id: ID!): Category
    categoriesTotal: CategoriesTotal!
    spendingLine(month: String): SpendingLine!

    tags: [Tag!]!

    recurrings(state: RecurringState): [Recurring!]!
    recurring(id: ID!): Recurring
    upcomingRecurrings(days: Int = 14): [UpcomingPayment!]!
    suggestedRecurrings: [SuggestedRecurring!]!
    suggestedRecurringFrequency(name: String!): Frequency

    accounts(includeHidden: Boolean = false): [Account!]!
    account(id: ID!): Account
    networthHistory(timeFrame: TimeFrame = THREE_MONTHS): [NetworthPoint!]!

    holdings(accountId: ID): [Holding!]!
    investmentBalance(timeFrame: TimeFrame = THREE_MONTHS, accountId: ID): [BalancePoint!]!
    investmentPerformance(timeFrame: TimeFrame = THREE_MONTHS): [PerformancePoint!]!
    investmentAllocation: [Allocation!]!
    topMovers: [TopMover!]!
    security(id: ID!): Security
  }

  input CreateTransactionInput { accountId: ID! date: String! name: String! amount: Float! type: TransactionType = regular categoryId: ID notes: String tagIds: [ID!] }
  input EditTransactionInput { name: String date: String amount: Float type: TransactionType categoryId: ID notes: String isReviewed: Boolean tagIds: [ID!] recurringId: ID }
  input SplitInput { amount: Float! categoryId: ID name: String }
  input BulkEditInput { categoryId: ID isReviewed: Boolean addTagIds: [ID!] type: TransactionType }

  input CategoryInput { name: String emoji: String color: String parentId: ID isExcluded: Boolean rolloverEnabled: Boolean }
  input RecurringInput { name: String emoji: String categoryId: ID frequency: Frequency state: RecurringState ruleNameContains: String minAmount: Float maxAmount: Float }
  input AccountInput { name: String type: AccountType subType: String color: String balance: Float isHidden: Boolean isClosed: Boolean }
  input TagInput { name: String color: String }

  type BulkEditResult { updated: Int! }

  type Mutation {
    createTransaction(input: CreateTransactionInput!): Transaction!
    editTransaction(id: ID!, input: EditTransactionInput!): Transaction!
    deleteTransaction(id: ID!): Boolean!
    splitTransaction(id: ID!, splits: [SplitInput!]!): Transaction!
    unsplitTransaction(id: ID!): Transaction!
    bulkEditTransactions(ids: [ID!]!, input: BulkEditInput!): BulkEditResult!
    bulkDeleteTransactions(ids: [ID!]!): BulkEditResult!

    createCategory(input: CategoryInput!): Category!
    editCategory(id: ID!, input: CategoryInput!): Category!
    deleteCategory(id: ID!): Boolean!
    "Sets the budget from a month onward (default: this month)."
    setBudget(categoryId: ID!, amount: Float!, month: String): Category!

    createRecurring(input: RecurringInput!): Recurring!
    editRecurring(id: ID!, input: RecurringInput!): Recurring!
    deleteRecurring(id: ID!): Boolean!
    addTransactionToRecurring(transactionId: ID!, recurringId: ID!): Transaction!
    createSuggestedRecurrings(names: [String!]): [Recurring!]!

    createAccount(input: AccountInput!): Account!
    editAccount(id: ID!, input: AccountInput!): Account!
    deleteAccount(id: ID!): Boolean!

    createTag(input: TagInput!): Tag!
    editTag(id: ID!, input: TagInput!): Tag!
    deleteTag(id: ID!): Boolean!
  }
`
