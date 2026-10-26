# personal-finance

A from-scratch rebuild of Copilot Money, guided by what [REA](https://github.com/morluto/rea) found
in the public site and web app. See [docs/rea-findings.md](docs/rea-findings.md).

| Folder | What it is | Port |
| --- | --- | --- |
| `web/` | Marketing landing page (Vite + React) | 5173 |
| `app/` | The finance app (Vite + React, React Router, TanStack Query) | 5180 |
| `server/` | GraphQL API (graphql-yoga) with built-in SQLite and seeded mock data | 4000 |

## Run the app

Needs Node 22.19+.

```bash
cd server && npm install && npm run dev    # API; seeds server/data/finance.db on first run
cd app && npm install && npm run dev       # open http://localhost:5180
```

`npm run seed` in `server/` resets the database to fresh demo data. `npm test` runs the logic tests.

## Features

- **Dashboard**: spending this month vs last month, net worth, transactions to review, budgets, bills due soon, investments.
- **Transactions**: search and filters, edit, categorize (with suggestions from past merchants), tags, notes,
  split, bulk edit, add manual transactions, CSV export.
- **Categories and budgets**: parent/child categories, monthly budgets, rollovers, 12-month history.
- **Recurrings**: rule-based matching, next payment prediction, payment history, auto-detection of untracked subscriptions.
- **Accounts**: net worth history, balances by type, manual accounts, hide/close.
- **Investments**: balance and performance over time, allocation, holdings with returns, top movers, per-security charts.

## Not built (yet)

Bank syncing (uses mock data), login/multiple users, households, goals, and AI chat.
