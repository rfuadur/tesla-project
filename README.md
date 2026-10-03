# Dhaka Tesla Pool 🛺

> Share a seat. Split the fare. Survive Dhaka traffic.

A ride-pooling MVP for Dhaka. Passengers request rides; when their trips fit together they share one three-seat
battery "Tesla", each paying their own fair fare, while the driver sees exactly who is riding and what stage the trip is in.

Built for the RoBenDevs engineering challenge with the story cast: **Jashim** and his Tesla **Bullet** (3 seats),
and passengers **Nusrat**, **Rafiq** and **Shirin**.

> 🚧 Work in progress. This README grows with the project: architecture and ERD, Docker setup, demo credentials,
> API overview, fare model, concurrency handling, tests, deployment, AI usage and the demo video are on the way.

## Planned stack
Next.js 16 (web) · Node.js 24 + Express 5 (API) · PostgreSQL 17 · Docker Compose

## Run it with Docker
Prerequisite: Docker Desktop (or Docker Engine with Compose v2).

```bash
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
docker compose up --build
```

Then open **<http://localhost:3000>** and sign in as one of the demo accounts below.

Compose starts the services in order: **db** (PostgreSQL, waits until healthy) → **migrate** (applies the SQL migrations
and seeds the story cast, then exits) → **api** (starts only if migrate succeeded) → **web** (the Next.js app, once the
API is healthy). The API's own health check is <http://localhost:4000/health>.

Stop with `docker compose down`, or `docker compose down -v` to also delete the database volume and start fresh.

## Run it for development
Postgres in Docker, the two apps on your machine (they reload on every save):

```bash
docker compose up -d db                                   # PostgreSQL only
cd apps/api && npm install && npm run db:migrate && npm run db:seed && npm run dev   # API on :4000
cd apps/web && npm install && npm run dev                 # web app on :3000 (forwards /api/* to :4000)
cd apps/api && npm test                                   # API tests (needs the db container)
```

### Demo accounts
All seeded accounts use the password **`banani0841`** (08:41 at Banani, when the story starts).

| Who | Email | Role |
|---|---|---|
| Jashim, driving Bullet (3 seats) | `jashim@teslapool.test` | Driver |
| Nusrat | `nusrat@teslapool.test` | Passenger |
| Rafiq | `rafiq@teslapool.test` | Passenger |
| Shirin | `shirin@teslapool.test` | Passenger |

## Design documents
- [Architecture](docs/architecture.md): containers, request flow, backend layers
- [Domain](docs/domain.md): ride and pool lifecycles, matching rule, fare model, the last-seat race
- [Database](docs/database.md): ERD, why each table exists, constraints and indexes
- [API](docs/api.md): endpoints, auth, error model
- [Decisions](docs/decisions.md): assumptions, technology choices, trade-offs
