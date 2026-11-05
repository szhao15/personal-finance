# Personal Finance App — Requirements

## Vision

An application to help me (and others) manage personal finances: see all spending in one place, track every investment account, and eventually ask questions about my finances in plain English, **without giving up privacy**.

This is also a learning project, so some technology choices are made partly for what they teach.

### Original goals

- A budgeting feature where the user uploads credit card statements from all their providers and sees an overall view of spending by category.
- A way to import investment accounts to see the full portfolio, including retirement accounts (401k, HSA, Roth IRA) and brokerage accounts.
- Privacy of user data comes first. How to keep data private can be decided later, but local LLM models are an interesting option.

---

## Guiding Principles

1. **Privacy by default.** Financial data never leaves the user's control unless the user explicitly opts in.
2. **Local-first.** The app runs fully on the user's own machine. Cloud hosting is optional and comes later.
3. **No third-party data sharing.** No analytics, telemetry, or ad trackers. No bank aggregator (e.g. Plaid or SimpleFIN): data comes in by file import only, never automatic bank syncing.
4. **User owns the data.** The user can export or permanently delete everything at any time.
5. **Start small.** Build a working slice end to end, then add to it.

---

## Features

### Phase 1 — MVP: Spending & Budgeting

**Statement import**
- Upload credit card and bank statements as **CSV** first, then **OFX/QFX** (most banks offer these), then **PDF** (hardest to parse, so last).
- Per-provider "import profiles" that map each bank's CSV columns (date, description, amount, etc.) to a standard format.
- **Duplicate detection**, so uploading overlapping statements doesn't double-count.
- Import history: which file, when, how many transactions, with the option to undo an import.

**Accounts**
- Create accounts (e.g. "Chase Sapphire", "Amex Gold", "Checking") and assign imports to them.

**Transactions**
- A single list across all accounts with search, filter (date, account, category, amount), and sort.
- Edit category, add notes and tags, and split one transaction across several categories.
- **Transfer detection**: credit card payments and moves between your own accounts are marked as transfers, not spending, to avoid double-counting.

**Categorization**
- A default category list (Groceries, Dining, Travel, Utilities, Rent, Subscriptions, etc.) that the user can customize.
- **Bank-provided categories as the default**: Chase CSVs include a category per transaction, so it is used when no rule matches.
- **Rules engine**: "if the description contains `TRADER JOE` → Groceries". Rules apply automatically on import, override the bank's category, and are applied to existing transactions when created.
- Learn from manual changes: offer to create a rule when the user re-categorizes a merchant.
- (Later) LLM-suggested categories for unknown merchants, using a local model.
- (Later) Users can define their own categories and see visualizations over different time ranges that exist in the data.

**Recurring charges & subscriptions**
- Detect repeating charges (same merchant, similar amount, regular interval).
- Flag price increases and forgotten subscriptions.
- List upcoming bills and total monthly recurring cost.

**Budgets**
- Monthly budget per category.
- Budget vs. actual with progress bars and overspending warnings.
- Average monthly spending, used to estimate the emergency fund needed (e.g. "you have 4.2 months of expenses saved").

**Dashboard**
- Spending by category (pie or bar chart) for a chosen period.
- Month-over-month spending trend.
- Income vs. expenses (cash flow) per month.
- Top merchants.

### Phase 2 — Investments & Net Worth

**Investment import**
- Import holdings/positions as CSV exports from brokerages (Fidelity, Vanguard, Schwab, etc.), again using per-provider import profiles.
- Account types: 401k, Roth IRA, Traditional IRA, HSA, taxable brokerage, cash.
- Holdings: ticker, shares, cost basis, current value.

**Portfolio views**
- Total portfolio value across all accounts.
- Asset allocation (stocks / bonds / cash / other), by account and combined.
- Breakdown by tax treatment (pre-tax, Roth, taxable, HSA).
- Fund overlap across accounts (e.g. the same S&P 500 fund held in three places).
- **Performance**: returns over time, contributions vs. investment gains, dividends, and comparison to a benchmark (e.g. S&P 500).

**Market prices**
- Fetch current prices for tickers. *Privacy note:* only ticker symbols are sent to the price provider, never quantities or account details. Allow manual price entry or turning fetching off.

**Net worth**
- Assets (cash + investments + manually entered assets like a home or car) minus liabilities (credit cards, loans).
- Net worth over time, from periodic snapshots.

### Phase 3 — Private AI Assistant

- Ask questions in plain English: *"How much did I spend on dining in Q2 vs Q1?"*, *"What subscriptions am I paying for?"*, *"What's my Roth vs pre-tax split?"*
- **Local LLM by default** (e.g. via Ollama): the model runs on the user's machine and data never leaves it.
- **Tool-based approach**: instead of putting raw transactions in the prompt, the LLM calls safe, read-only tools (e.g. `get_spending_by_category(start, end)`) or generates read-only SQL that is checked before it runs.
- Optional cloud model mode, only with explicit opt-in, a clear warning, and redaction or summarization of the data first.
- Show the user exactly which data was sent to the model for each answer.

### Additional Useful Features (Backlog)

- **Savings goals**: e.g. "Emergency fund: $10k by June", with progress tracking.
- **Reports**: monthly and yearly summaries; a year-end spending report.
- **Tax helpers**: tag tax-relevant transactions (charitable, medical, HSA-eligible); track contributions against annual limits for 401k, IRA, and HSA.
- **Alerts**: unusual spending, large transactions, budget limits reached.
- **Multi-user / household**: separate users with shared accounts (later).
- **Data export & backup**: export everything as CSV/JSON; encrypted backups.
- **Multi-currency** support (later).

---

## Privacy & Security Requirements

- **Encryption at rest**: the database and uploaded files are encrypted (e.g. SQLCipher or an encrypted Postgres volume; AWS KMS if hosted).
- **Encryption in transit**: HTTPS only, even locally if possible.
- **Authentication**: strong password hashing (argon2/bcrypt); MFA (TOTP) when hosted.
- **Delete uploaded statements after parsing** (or encrypt them), and keep only the extracted transactions.
- **No sensitive data in logs**: no account numbers, amounts, or descriptions.
- **Mask account numbers**: store and show only the last 4 digits.
- **LLM safeguards**: local by default; read-only data access; tool/SQL validation; defenses against prompt injection (e.g. a merchant description containing instructions).
- **Audit log**: record imports, exports, deletions, and LLM queries.
- **Full data deletion**: one action removes all of a user's data.
- **Threat model**: write a short document on what we protect against (stolen laptop, hosting provider access, compromised dependencies, LLM data leakage).

---

## Proposed Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **React + TypeScript** (Vite), Tailwind CSS, Recharts or similar | Industry standard; strong typing; good chart libraries |
| Backend API | **Python + FastAPI** | Python has the best tools for data parsing (pandas, ofxparse, pdfplumber) and LLM work; FastAPI is modern, typed, and quick |
| Database | **PostgreSQL** (via Docker locally) | Industry standard; exact `NUMERIC` money values; read-only roles for safe LLM access; maps directly to AWS RDS later |
| ORM / migrations | SQLAlchemy + Alembic | Standard Python tools for database access and schema changes |
| Local LLM | **Ollama** running open models (Llama, Qwen, Mistral, etc.) | Simple to run locally, supports tool calling, swappable models |
| LLM orchestration | Plain tool calling first; maybe a framework later | Learn the basics before adding abstractions |
| Containers | **Docker + Docker Compose** | One command runs the whole stack; same setup locally and on AWS |
| Testing | pytest (backend), Vitest (frontend), Playwright (end-to-end) | |
| CI | GitHub Actions | Lint, tests, and dependency/security scans on every push |

**Money handling rule:** never store currency as floats. Store amounts as `NUMERIC(12,2)` and use Python `Decimal`. Negative = money out, positive = money in.

### AWS (Later Phase)

Hosting on AWS is a learning goal, but it pulls against "local-first privacy". Suggested approach: **build local-first, then deploy to AWS as a second, optional mode.**

- **Compute:** ECS Fargate or App Runner (containers), or Lambda for the API
- **Database:** RDS PostgreSQL with KMS encryption
- **File storage:** S3 with server-side encryption (SSE-KMS) and lifecycle rules to delete raw statements
- **Auth:** Amazon Cognito
- **Secrets:** AWS Secrets Manager
- **Auditing:** CloudTrail, CloudWatch (with no sensitive data in logs)
- **Infrastructure as code:** Terraform or AWS CDK
- **LLM option:** Amazon Bedrock, a middle ground where data stays in your AWS account/region and, per AWS policy, isn't used for training. Worth comparing against a local LLM.

---

## Decisions (2026-11-04)

- **Users:** built for one user (me), running locally, with no login screen for now. Making it public later is a goal, because it's a security learning opportunity and others could use it, and is planned as a future phase.
- **Database:** PostgreSQL. Data is stored on disk in a Docker volume, so it survives restarts. Backups use `pg_dump`. Encryption at rest comes from FileVault locally, and KMS on AWS later.
- **Running the app:** Docker Compose with three services (`db`, `backend`, `frontend`), started with `docker compose up`. All ports are bound to `127.0.0.1` so only this machine can reach them. The secret DB password lives in an ignored `.env` file.
- **Imports:** the backend parses uploaded files in memory and shows a preview before saving. It saves only the transactions, plus an `imports` record with the file's SHA-256 hash to catch re-uploads. The raw file is discarded.
- **Bank data:** file import only, with no aggregators (see Guiding Principles).
- **First import:** a Chase credit card CSV. Other banks and PDF come after the first milestone works.
- **Deferred:** which local LLM model to use is decided in Phase 3. The desktop wrapper (Tauri) is revisited after Phase 1.

### Phase 1 Data Model (sketch)

| Table | Key columns |
|---|---|
| `accounts` | `name`, `institution`, `type`, `last4` |
| `imports` | `account_id`, `filename`, `file_sha256`, `row_count`, `imported_at` — one row per uploaded file; deleting it undoes the import |
| `transactions` | `account_id`, `import_id`, `date`, `description_raw` (exact bank text), `merchant` (cleaned name), `amount NUMERIC(12,2)`, `category_id`, `is_transfer`, `dedup_key` (hash to skip duplicates) |
| `categories` | `name` |
| `rules` | `match_text`, `category_id` — e.g. `TRADER JOE` → Groceries |

---

## Learning Opportunities

- **Local LLMs**: How can AI features over private data stay private? Are local models the best way? Compare local (Ollama) vs. Bedrock vs. a cloud API with redaction.
- **LLM tool calling / agents**: design safe, read-only tools; text-to-SQL; evaluate answer accuracy.
- **Working with AWS**: containers, RDS, S3, KMS, Cognito, IAM, infrastructure as code.
- **Security engineering**: encryption, auth/MFA, threat modeling, secure handling of uploaded files.
- **Data engineering**: parsing messy CSV/OFX/PDF files, normalization, deduplication.
- **Full-stack TypeScript + Python**: React frontend, FastAPI backend, typed API contracts (OpenAPI).
- **DevOps**: Docker, GitHub Actions CI, automated testing.

---

## Suggested First Milestone

> Upload a Chase credit card CSV → transactions are parsed, deduplicated, and stored → categorized by rules → shown on a dashboard with spending by category for the month.

This touches every layer (frontend, API, parsing, database, charts) on a small scope.
