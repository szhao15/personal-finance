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
