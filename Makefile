SHELL := /bin/bash

DATABASE_URL ?= postgres://postgres:postgres@localhost:5432/pango_policy

.PHONY: help db-up db-down db-logs db-psql db-push db-studio dev lint typecheck

help: ## Show available commands
	@echo "Available targets:"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' Makefile | sed 's/:.*## / - /'

db-up: ## Start local Postgres in Docker
	docker compose up -d postgres

db-down: ## Stop local Postgres container
	docker compose down

db-logs: ## Tail Postgres logs
	docker compose logs -f postgres

db-psql: ## Open psql shell in the Postgres container
	docker compose exec postgres psql -U postgres -d pango_policy

db-push: ## Push Drizzle schema to local database
	DATABASE_URL="$(DATABASE_URL)" bun run db:push

db-studio: ## Open Drizzle Studio against local database
	DATABASE_URL="$(DATABASE_URL)" bun run db:studio

dev: ## Run Next.js via Portless
	bun run dev

lint: ## Run ESLint
	bun run lint

typecheck: ## Run TypeScript type check
	bun run typecheck
