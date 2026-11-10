# personal-finance

A privacy-first personal finance app that runs entirely on your own machine. See [requirements.md](requirements.md) for goals and decisions.

## Run it

Requires Docker Desktop.

```bash
cp .env.example .env      # then set DB_PASSWORD to something random
docker compose up --build
```

Open http://localhost:5173. The API docs are at http://localhost:8000/docs.

Stop with `docker compose down`; your data stays in the `pgdata` volume. `docker compose down -v` deletes it permanently.

## Development vs. prod

There are two separate copies of the app, each with its own database:

| | Development | Prod |
|---|---|---|
| Start | `docker compose up` | `./prod up -d` |
| Stop | `docker compose down` | `./prod down` |
| Compose project | `finance-dev` | `finance-prod` |
| Password file | `.env` | `.env.prod` (created on first run) |
| Data | fake only (`dev-data/`) | your real statements |
| Page | orange "Development · fake data only" badge, tab title starts with DEV | no badge |

Both use the same ports, so only one can run at a time. Stop one before starting the other. Run only the development copy while working with an AI assistant.

Load fake data into the dev copy: add an account, then import `dev-data/fake_chase_card.csv` (about 200 transactions from June to November 2026). To regenerate it: `python3 backend/scripts/make_fake_data.py`.

Back up prod data: `./prod exec db pg_dump -U finance finance > ~/finance-backup.sql`

## Use it

1. Add an account (e.g. "Chase Sapphire").
2. In Chase, download your card activity as CSV and choose it under **Import a statement**.
3. Check the preview, then confirm. Only new transactions are saved; the file itself is not kept.
4. Pick a month to see spending by category. Card payments count as transfers, not spending.

## Tests

```bash
docker compose exec backend pytest
```

## Layout

- `backend/`: Python, FastAPI, SQLAlchemy, Alembic migrations, Chase CSV parser (`app/chase.py`)
- `frontend/`: React, TypeScript, Vite, Recharts
- `docker-compose.yml`: Postgres, backend and frontend, reachable only from this machine
