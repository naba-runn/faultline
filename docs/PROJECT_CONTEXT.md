# Faultline — Project Context

> Workflow and behavior rules live in `PROJECT_RULES.md`.
> This file is the canonical, continuously-updated source of truth for
> "where are we right now" — edited in place, not regenerated.
> `HANDOFF.md` carries a condensed snapshot of this file's content
> forward at session boundaries so a new session can start from one
> file, but this file remains the ground truth if the two ever drift.
> Read order for a new session: `PROJECT_RULES.md` → `HANDOFF.md` →
> this file → `TASKS.md`.

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

**Milestone 1: Backend Foundation** — **COMPLETE** (4 of 4 tasks done)
**Milestone 2: Projects & Ingestion** — in progress (6 of 6 tasks done)
**Milestone 3: AI Enrichment** — in progress (2 of 4 tasks done)
## Current Task

Task 6 — `apiKeyMiddleware`: **DONE** (5/5 manual test cases passed:
valid key, missing header, malformed key, wrong key, deleted-project
key)
Task 7 — Ingestion endpoint skeleton (`POST /api/events`): **DONE**
(validates + `202`s; deliberately does not persist — see
DECISIONS.md's "Ingestion endpoint is a skeleton" entry. Status codes
verified for all 5 cases; response *bodies* were not individually
re-confirmed in chat, only status codes — worth a spot-check before
building Task 8 on top if that matters to you.)
Task 8 — Stack normalizer + fingerprint service: **DONE**
  - 8.1 (stack normalizer utility): **DONE** — `parseStackFrames`/
    `normalizeStack` in `server/utils/stackNormalizer.js`, manually
    verified (cross-environment path stability, node_modules
    filtering, frame cap, anonymous frames, garbage input)
  - 8.2 (fingerprintService — hashes type + signature into the dedup
    key): **DONE** — `server/services/fingerprintService.js`,
    manually verified (cross-env equality, type-mismatch produces
    different fingerprint, stackless fallback)

Task 9 — ErrorGroup/ErrorEvent models + atomic upsert dedup: **DONE**
  - 9.1 (ErrorGroup model): **DONE** — `server/models/ErrorGroup.js`,
    compound unique index on `{ projectId, fingerprint }`, manually
    verified via `validateSync()` (valid doc clean, required-field
    rejection, bad-enum rejection, all defaults correct). Compound
    unique index now exercised live as part of 9.3.
  - 9.2 (ErrorEvent model): **DONE** — `server/models/ErrorEvent.js`,
    manually verified via `validateSync()` (valid doc clean, both
    required-field rejections, all defaults correct).
  - 9.3 (wire fingerprintService + atomic upsert into
    ingestController): **DONE** — `server/services/errorGroupService.js`
    (`recordEvent()`), `server/controllers/ingestController.js` updated
    to call it. Manually verified live against Atlas: duplicate event
    collapses into one `ErrorGroup` (`count: 2`, 2 linked `ErrorEvent`
    docs); distinct event produces a separate `ErrorGroup` (`count: 1`).

Task 10 — demo Express app that throws sample errors, to verify dedup
manually end-to-end — **DONE**
  - `demo-app/index.js` — Express app with three routes (`/crash/type-error`,
    `/crash/range-error`, `/crash/custom`) that each throw a distinct
    error, caught by an error-handling middleware that forwards it to
    Faultline's `/api/events` (fire-and-forget, never blocks or crashes
    the demo app itself)
  - `demo-app/package.json`, `.env.example`, `README.md` — setup/usage
  - Manually verified end-to-end against live server + Atlas: repeated
    hits on one route collapsed into one `ErrorGroup` (`count: 3`), the
    other two each produced their own `ErrorGroup` (`count: 1`); 5 total
    `ErrorEvent` docs split 3/1/1 across the three groups, all correctly
    linked
Task 11 — aiService (buildPrompt/callGemini/parseAndValidate): **DONE**
— `server/services/aiService.js`, using `@google/genai` +
`gemini-2.5-flash`. Manually verified: pure functions tested locally
(valid/invalid inputs), `callGemini` tested live against a real API
key. Tasks 12 (GitHub fetch), 13 (wire into ingestion), 14 (derived
confidence/affectedFile/affectedFunction) remain.

+Task 12 — GitHub Contents API fetch (grounding): **DONE** —
+`server/services/githubService.js` (`fetchCodeSnippet`/`extractSnippet`).
+Manually verified: pure windowing logic locally, live fetch against a
+real public repo (valid/missing file, no-repo, bad-format all
+correctly return `null` without throwing). Tasks 13 (wire into
+ingestion) and 14 (derived confidence/affectedFile/affectedFunction)
+remain.

> Note: AppError/catchAsync were intentionally NOT used across
> Milestone 1 — plain try/catch throughout, matching TASKS.md's
> assignment of that pattern to Task 20.

## Completed So Far

- Monorepo folder scaffolding (`server/{config,controllers,services,
  middleware,routes,models,utils}`, `client/`, `demo-app/`)
- `server/package.json` with core dependencies
- `server/.env.example`
- `client/README.md`, `demo-app/README.md` placeholders
- `server/config/env.js` — env loader with required-var validation
- `server/app.js` — Express skeleton (helmet, cors, body cap, morgan,
  `/health`, 404 handler, error handler stub)
- `server/server.js` — bootstrap with unhandledRejection/uncaughtException guards
- `server/config/db.js` — Mongoose connection to MongoDB Atlas (M0 dev cluster)
- `server/models/User.js` — schema (name, email unique, passwordHash, createdAt)
  with bcrypt password hashing (pre-save hook) and `comparePassword` method
- `server/utils/generateToken.js` — JWT signing helper
- `server/services/authService.js` — `register()`, `login()`
- `server/controllers/authController.js` — `register()`, `login()`
- `server/routes/authRoutes.js` — `POST /api/auth/register`, `POST /api/auth/login`, wired into app.js
- `server/middleware/authMiddleware.js` — JWT verification, attaches `req.user`
- `GET /api/auth/me` protected route (authController.me + authMiddleware)
- `server/models/Project.js` — schema (ownerId ref User, name,
  apiKeyHash, githubRepo validated `owner/repo`, timestamps incl.
  updatedAt)
- `server/utils/apiKey.js` — `generateApiKey()`, `hashApiKey()`
  (SHA-256, deliberately not bcrypt — see DECISIONS.md)
- `server/services/projectService.js` — create/list/get/update/delete,
  every query ownership-scoped via `{ _id: projectId, ownerId }`
  together (not a separate ownership check after `findById`)
- `server/controllers/projectController.js` — thin HTTP layer over
  projectService
- `server/routes/projectRoutes.js` — `POST /`, `GET /`, `GET/PATCH/DELETE
  /:id`, all behind `authMiddleware`, wired into app.js as `/api/projects`
- Full CRUD manually verified end-to-end against the live MongoDB
  Atlas dev cluster, including the post-delete `404` (not `403`)
  enumeration-avoidance behavior from DECISIONS.md
- `server/middleware/apiKeyMiddleware.js` — verifies `Bearer flt_...`
  against `apiKeyHash` via indexed lookup + `crypto.timingSafeEqual`,
  attaches `req.project`; all 5 manual test cases passed
- `server/routes/ingestRoutes.js`, `server/controllers/ingestController.js`
  — `POST /api/events` skeleton: validates `message`/`stack`, guarded
  by `apiKeyMiddleware`, returns `202` without persisting (persistence
  starts Task 9)
- `server/utils/stackNormalizer.js` — `parseStackFrames()`,
  `normalizeStack()`, `normalizeFilePath()`: pure functions, no DB, no
  req/res; reduces a raw stack trace to a stable cross-environment
  signature (app frames only, capped at 5, paths anchored to the last
  recognized project-root segment) for `fingerprintService` (Task 8.2)
  to hash
- `server/services/errorGroupService.js` — `recordEvent()`: fingerprint
   atomic upsert dedup + `ErrorEvent` creation, wired into
  `ingestController`

## Not Yet Built

Tasks 9 and 10 are fully closed — dedup persistence exists and is
verified end-to-end via the demo app. Next up per TASKS.md: Task 11,
AI enrichment. All React pages, remaining backend polish. See
TASKS.md for the full breakdown.

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