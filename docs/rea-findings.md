# REA findings: Copilot Money web app

How this was gathered: REA (`analyze_web_bundle`, `inspect_web_page`, `export_web_scripts`) ran against
the public, logged-out `app.copilot.money/login` page on 2026-10-25. The browser preloads most of the
app's JavaScript there, so its GraphQL documents and routes could be read statically. No account was
used and no API calls were made. There is no web demo mode (only the phone app has one).

We use this as a **feature and data-model reference** and write our own implementation.

## Screens (client routes)

| Area | Routes |
| --- | --- |
| Dashboard | `/dashboard` |
| Transactions | `/transactions`, `/transactions/:transactionId` |
| Accounts | `/accounts`, `/accounts/a/:accountId` |
| Investments | `/investments`, `/investments/h/:securityId` |
| Categories | `/categories`, `/categories/:categoryId`, `create` |
| Recurrings | `/recurrings`, `/recurrings/:recurringId`, `create` |
| Settings | `/settings/{general,account,connections,household,subscription,ai-apps,about}` |
| Onboarding | `/onboarding/{accounts,transactions,review,survey,security,notifications,subscription}` |

## Data model (from GraphQL fragments)

- **Account**: name, type, subType, mask, color, balance, liveBalance, limit, isManual,
  isUserHidden, isUserClosed, institutionId, latestBalanceUpdate. Balance history is `{date, balance}`.
- **Transaction**: name, amount, date, type, categoryId, accountId, recurringId, parentId (splits),
  isReviewed, isPending, userNotes, tipAmount, tags[], goal, suggestedCategoryIds, createdAt.
- **Category**: name, icon (emoji), colorName, isExcluded, isRolloverDisabled, canBeDeleted,
  childCategories (parent/child tree), templateId.
- **CategoryMonthlyBudget**: month, amount, rolloverAmount, resolvedAmount, childAmount,
  childRolloverAmount, unassignedAmount, unassignedRolloverAmount, goalAmount.
- **CategoryMonthlySpent**: month, amount, comparisonAmount, paidRecurringAmount, unpaidRecurringAmount.
- **Recurring**: name, emoji, categoryId, frequency, state, nextPaymentDate, nextPaymentAmount,
  rule `{nameContains, minAmount, maxAmount, days}`, payments `{date, amount, isPaid}`,
  keyMetrics `{averageTransactionAmount, totalSpent, period}`.
- **Tag**: name, colorName.
- **NetworthHistory**: date, assets, debt (total = assets - debt).
- **Holding**: security, quantity, accountId, metrics `{averageCost, costBasis, totalReturn}`.
- **Security**: symbol, name, type, currentPrice, marketInfo `{openTime, closeTime}`.
- **Allocation**: type, amount, percentage.

## Operations (feature list)

- Transactions: paged list with `filter` and `sort`, create (manual), edit, delete, **split**,
  **bulk edit**, bulk delete, add to recurring, export to CSV.
- Categories: list (with spend and budget), create, edit, delete, key metrics (avg monthly, total
  spent per year), category templates, suggested categories.
- Budgets: edit budget, edit per-month budgets, rollovers (per category opt-out).
- Recurrings: list (filter by state), detail, create, edit, delete, suggested frequency for a
  transaction, **create suggested recurrings** (auto-detection), upcoming unpaid recurrings.
- Accounts: list, detail, balance history, monthly totals, create manual account, edit, delete.
- Net worth: history by time frame, live balance.
- Investments: holdings, aggregated holdings, balance and performance by time frame, allocation,
  benchmarks, top movers, security price history.
- Also present but out of scope for now: households, subscriptions/billing, bank connections,
  onboarding, goals, connected AI apps.

## Computed on Copilot's servers (we must build our own)

The client hooks (`useBudget`, `useSpend`) only read fields, so these are server-side:
budget rollover and resolved amounts, monthly spend aggregates, recurring matching and detection,
category suggestions, net worth history, and investment performance. Bank syncing goes through a
third-party aggregator; this project uses seeded mock data instead.
