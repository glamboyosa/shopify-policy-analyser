# Shopify Policy Analyzer

Policy extraction and onboarding insights for Shopify stores.

This project is an exploration of practical policy intelligence, not a paid product.
It is intentionally simple and transparent so it can be run, modified, and potentially
open-sourced.

## Why This Architecture

- `Next.js` + `Hono` for a single app + API deployment surface.
- `Drizzle` + `Postgres` for explicit schema and inspectable stored outputs.
- Fast path with `Readability`, resilient path with `Firecrawl` for JS-heavy pages.
- `Gemini 3 Flash` structured extraction to keep latency and cost low.
- SSE status updates so onboarding feels live rather than blocking.

## Current Product Behavior

- Analyze a store URL and discover likely shipping/returns sources.
- Scrape pages, extract structured policy fields, persist full text and JSON.
- Render onboarding summary cards, warnings, and lightweight policy Q&A.
- Reuse existing store records, but re-analyze when prior policy data is low quality.
- Basic lazy abuse protection: `POST /api/stores` capped to 5 attempts per IP per 24h
  (in-memory limiter, suitable for exploration deployments).

## Stack

- Next.js App Router
- Hono catch-all route at `/api/*`
- Drizzle ORM + `pg` (`drizzle-orm/node-postgres`)
- Postgres 16 (Docker)
- Tailwind + shadcn/ui
- AI SDK + `@ai-sdk/google` (`google("gemini-3-flash")`)

## Prerequisites

- Bun
- Docker
- Portless

Install Portless globally:

```bash
npm install -g portless
```

## Local Setup

1. Install dependencies:

```bash
bun install
```

2. Create local env:

```bash
cp .env.example .env.local
```

3. Start Postgres:

```bash
make db-up
```

4. Apply migrations and verify:

```bash
make db-migrate
make db-verify
```

Database note: this project intentionally uses `127.0.0.1:5433` to avoid collisions
with host Postgres commonly running on `localhost:5432`.

## Run

```bash
make dev
```

App URL:

`http://pango-policy.localhost:1355`

## Environment Variables

```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/shopify_policy
GOOGLE_GENERATIVE_AI_API_KEY=
FIRECRAWL_API_KEY=
```

## Database Utilities

- Start DB: `make db-up`
- Stop DB: `make db-down`
- DB logs: `make db-logs`
- SQL shell: `make db-psql`
- Generate migrations: `make db-generate`
- Apply migrations: `make db-migrate`
- Push schema: `make db-push`
- Verify tables: `make db-verify`
- Open Drizzle Studio: `make db-studio`

## Quality Checks

```bash
make typecheck
make lint
```
