# Pango Policy

Store policy analyzer foundation for Shopify-focused onboarding.

## Stack

- Next.js App Router
- Hono (`/api/*` catch-all route)
- Drizzle ORM + Postgres (`postgres` driver)
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

4. Push Drizzle schema:

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
- Push schema: `make db-push`
- Open Drizzle Studio: `make db-studio`

## Quality checks

```bash
make typecheck
make lint
```
