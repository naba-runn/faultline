# Faultline — Project Context

> Read this file first. It is the single source of truth for "where are we
> right now." If you are a new Claude session picking this project up,
> read this, then TASKS.md, then ARCHITECTURE.md.

## What Faultline Is

An AI-grounded error intelligence platform (scoped-down Sentry). Client
apps POST runtime errors to an ingestion API. Faultline deduplicates
them into error groups via stack-trace fingerprinting. On the *first*
occurrence of a new error group (never per-event), it fetches the
offending source file from the linked GitHub repo and calls Gemini to
produce a structured root-cause summary. AI is a backend enrichment
step, not the product.

Full design rationale: see `faultline-architecture-review.md` (the
approved v2 blueprint — treat as final, do not redesign).

## Current Milestone

**Milestone 1: Backend Foundation** (Day 1 Morning on the roadmap)
Status: In progress — Task 1 of 4 complete.

## Current Task

Task 1 — Monorepo init & Express skeleton: **DONE**
Task 2 — MongoDB connection + User model: **NEXT**

## Completed So Far

- Monorepo structure (`client/`, `server/`, `docs/`, `demo-app/`)
- Express app skeleton with health check, security middleware (helmet,
  cors, body-size cap), request logging, 404 handler, and a stub
  centralized error handler
- Environment config loader (`server/config/env.js`)

## Not Yet Built

Everything past the skeleton: DB connection, models, auth, ingestion,
fingerprinting/dedup, AI enrichment, all React pages. See TASKS.md for
the full breakdown.

## Key Architectural Decisions Already Locked In

These came out of the design review and should not be re-litigated by
a future session — implement them as-is:

1. **Dedup uses atomic `findOneAndUpdate` upsert**, not read-then-write.
   First-occurrence detection uses `upsertedId` from the Mongo result,
   not a separate existence check. (See AI_CONTEXT.md and DATABASE.md.)
2. **AI enrichment is fire-and-forget**, dispatched after the ingestion
   response is sent — never awaited in the request/response cycle.
3. **AI confidence score is derived programmatically** (did GitHub file
   fetch succeed?), never self-reported by the LLM.
4. **`aiService` is split into pure functions** (`buildPrompt`,
   `callGemini`, `parseAndValidate`) — not a 4-class provider hierarchy.
5. **API-key auth (ingestion) and JWT auth (dashboard) are deliberately
   separate middleware** — one authenticates a program, one a user.
6. Raw fetched GitHub source snippets are **never persisted** to the DB
   — only the AI's derived summary is stored.

## Where Things Live

- Blueprint / design review: repo root (or wherever you keep
  `faultline-architecture-review.md`)
- Living docs: `/docs`
- Server code: `/server`
- Client code: `/client` (not yet scaffolded)