# Technical overview

This document describes how the Shopify Policy Analyzer works end to end: discovery, scraping, extraction, persistence, streaming to the browser, and the client-side experience (including resumability).

## High-level architecture

- **Next.js (App Router)** serves the UI and hosts a **Hono** catch-all API under `/api/*`.
- **Drizzle ORM** + **`pg`** persist stores and policy rows in **Postgres**.
- **AI SDK** + **`@ai-sdk/google`** call **Gemini** for structured extraction and optional policy Q&A.

## Policy URL discovery

1. **Homepage fetch** — The store URL is normalized; apex and `www` variants are tried with browser-like headers and short HTTP timeouts.
2. **Link extraction** — Anchor `href`s are collected from the homepage HTML. Paths are filtered (e.g. skip `/products/`, static assets, obvious non-policy routes) while keeping URLs that look like shipping, returns, policies, help, or support.
3. **Sitemap / robots** — `robots.txt` is read when available to discover a sitemap URL for extra candidate pages; policy-like paths are scored and merged with homepage links.
4. **De-duplication** — Candidates are normalized to a stable set before scraping.

## Scraping: Readability first, Firecrawl when needed

For each candidate URL:

- **Fast path:** Fetch HTML, run **Mozilla Readability** inside **jsdom** to extract article-like main text.
- **Heuristics:** If the HTML looks like an embedded app shell (common on large merchants) or Readability yields little usable text, the pipeline can fall back to **Firecrawl** (when `FIRECRAWL_API_KEY` is set) to render or fetch clean content.
- **Policy signal:** Extracted text is checked for policy-related language so noisy pages are dropped early.

Successful sections are combined into **batched extraction inputs** (capped chunk sizes) so many policy URLs can be covered without blowing a single model context window.

## Structured extraction (AI)

- The model returns a **typed object** (Zod-validated): shipping and returns fields, confidence, notes, and optionally **`default_region`** plus **`region_overrides`** when terms differ by geography.
- Multiple batches are **merged** into one record (scalar “first good value,” lists unioned, overrides concatenated across batches).
- Extraction runs under a **configurable wall-clock timeout** (currently two minutes per extraction call) so a run cannot hang indefinitely.

Raw extraction is stored in **`raw_json`**; normalized columns land on **`store_policies`** for querying and UI.

## Persistence

- **`stores`** — URL and display name.
- **`store_policies`** — Structured fields, **`policy_text`** (concatenated / merged scrape text for Q&A), **`raw_json`**, timestamps, **`default_region`**, **`region_overrides`** (JSONB), etc.

## Server-sent events (SSE)

Long-running analysis does not block the UI on a single HTTP request:

- The client opens **`GET /api/stores/:storeId/policies/stream`** with `Accept: text/event-stream`.
- The server emits **stage**, **progress**, **error**, and **complete** events with JSON payloads (step, message, percent, warnings, optional result summary).
- The UI uses **TanStack Query** `streamedQuery` to accumulate events and drive a live timeline.

Users see progress instead of a spinner that might never update.

## REST surface (after analysis)

- **`GET /api/stores/:storeId/policies`** — Latest policy row plus **deterministic onboarding insights** (summary bullets and warnings).
- **`GET /api/stores/:storeId/policies/ask?q=...`** — Grounded Q&A: the server builds a **compact structured digest** (default region, merged fields, per-region overrides) and prepends it to the prompt, then appends the full **`policy_text`** so the model can reconcile structured hints with raw text (preferring the text on conflict).

## Regional terms in the UI

When **`region_overrides`** is present and non-empty, the UI shows a **“Varies by region”** disclosure with nested details per region. When only **`default_region`** exists, a simple one-line region card is shown.

## Abuse and reuse

- **`POST /api/stores`** is rate-limited per IP (exploration deployments: a small number of creates per 24 hours).
- Existing stores may be **reused** by URL; policy rows may be refreshed when prior analysis is considered low quality (implementation-specific).

## Client resumability and local storage

- **Onboarding snapshot** — `storeId`, URL, name, and whether analysis completed are saved under a fixed **`localStorage`** key so a **refresh** can restore the session and skip losing context.
- **Policy Q&A chat** — Messages are keyed **per `storeId`** in `localStorage` so returning to the same store keeps the conversation thread until cleared or the user starts another store.

The SSE stream itself is not persisted; if the user refreshes mid-run, they rely on persisted state plus re-fetching policy when complete, or kicking off a new run as the product allows.

## Environment

- **`DATABASE_URL`** — Postgres connection string.
- **`GOOGLE_GENERATIVE_AI_API_KEY`** — Required for extraction and Q&A.
- **`FIRECRAWL_API_KEY`** — Optional; enables fallback scraping for difficult pages.

## Operational notes

- Migrations are **Drizzle Kit** generated; apply with `make db-migrate` (see README).
- Extraction timeout and model id are defined in **`lib/policies/analyzer.ts`** and related helpers.
