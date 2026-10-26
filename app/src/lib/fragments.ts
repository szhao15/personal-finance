// Shared GraphQL field selections, so every screen asks for the same shapes.
export const CATEGORY_LITE = 'id name emoji color parentId isExcluded'
export const ACCOUNT_LITE = 'id name institution mask color type'
export const TX_FIELDS = `
  id date name amount type isReviewed isPending isSplit notes
  category { ${CATEGORY_LITE} }
  account { ${ACCOUNT_LITE} }
  recurring { id name emoji }
  tags { id name color }
`
export const ACCOUNT_FIELDS = `${ACCOUNT_LITE} subType balance limit isManual isHidden isClosed isDebt updatedAt change3m`
export const RECURRING_FIELDS = `
  id name emoji frequency state nextPaymentDate nextPaymentAmount
  category { ${CATEGORY_LITE} }
  rule { nameContains minAmount maxAmount }
`
export const ALL_CATEGORIES = `query AllCategories { allCategories { ${CATEGORY_LITE} } }`
export const ALL_TAGS = 'query Tags { tags { id name color } }'
export const ALL_ACCOUNTS = `query AccountsLite { accounts(includeHidden: true) { ${ACCOUNT_LITE} isHidden isClosed } }`
