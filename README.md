# Pango Policy

Store policy analyzer foundation for Shopify-focused onboarding.

## Stack

- Next.js App Router
- Hono (`/api/*` catch-all route)
- Drizzle ORM + Postgres (Bun SQL driver)
- Tailwind + shadcn/ui
- Typed env validation via `@t3-oss/env-nextjs` + `zod`

## Prerequisites

- Bun
- Docker
- Portless installed globally

```bash
npm install -g portless
```

## Setup

1. Install dependencies:

```bash
bun install
```

2. Create your local env file:

```bash
cp .env.example .env
```

3. Start local Postgres:

```bash
make db-up
```

4. Generate and apply Drizzle migrations:

```bash
make db-generate
make db-migrate
make db-verify
```

If you want a fast local sync without versioned migration files, you can still run:

```bash
make db-push
```

## Run the app

```bash
make dev
```

App runs through Portless at:

`http://pango-policy.localhost:1355`

## API (current phase)

- `GET /api/health` - basic health endpoint

## Database utilities

- Start DB: `make db-up`
- Stop DB: `make db-down`
- DB logs: `make db-logs`
- SQL shell: `make db-psql`
- Generate migrations: `make db-generate`
- Apply migrations: `make db-migrate`
- Push schema: `make db-push`
- Verify tables: `make db-verify`
- Open Drizzle Studio: `make db-studio`

## Quality checks

```bash
make typecheck
make lint
```
