# Faultline — Status

> Single source of truth for "where are we, right now." Edited in
> place, never regenerated wholesale (see `PROJECT_RULES.md` §3 for
> why the old two-file `PROJECT_CONTEXT.md`/`HANDOFF.md` split was
> retired in favor of this one file). Read order for a new session:
> `PROJECT_RULES.md` → this file → `TASKS.md`.

## Current Milestone / Task

- **Milestone 1 — Backend Foundation:** COMPLETE (4/4 tasks)
- **Milestone 2 — Projects & Ingestion:** COMPLETE (6/6 tasks)
- **Milestone 3 — AI Enrichment:** COMPLETE (4/4 tasks)
- **Milestone 4 — Dashboard Auth & Core Pages:** COMPLETE (4/4 tasks)
- **Milestone 5 — Detail View & Polish:** IN PROGRESS (2/6 tasks — 19, 20 done)

Task numbering and full checklist: `TASKS.md`. This section only
states current position, not a restated description of every task —
that would duplicate `TASKS.md`.

## What's Actively In Progress

Nothing mid-implementation as of this pass. Most recently completed:
**Task 20 — Centralized error middleware (AppError + catchAsync) +
validation pass**, across three subtasks:

- **20.1** — `utils/AppError.js`, `utils/catchAsync.js`, and
  `middleware/errorMiddleware.js` (single centralized handler,
  replacing the Task-1 stub; mounted last in `app.js`).
- **20.2** — Controllers refactored onto `catchAsync`/`AppError`,
  duplicated try/catch removed — except the deliberate local
  `CastError`-to-resource-specific-404 translation kept in
  `projectController`/`groupController` (only the controller layer
  knows the right resource name; the centralized handler's own
  `CastError` path is a generic fallback only).
- **20.3** — Validation pass: `projectController.createProject`/
  `updateProject` now reject a truthy-but-non-string `name` and a
  non-string `githubRepo`, closing the same typeof gap already fixed
  in `authController` (`updateProject` previously had *no* input
  validation before this). `githubRepo`'s format validation stays at
  the schema level (`Project.js`'s regex) — unchanged. `env`/
  `metadata` on ingestion remain deliberately unvalidated by design
  (see `DECISIONS.md`).

Full reasoning for each subtask is in `DECISIONS.md` — "Task 20.3:
project input validation — closing the typeof gap" plus the Shipped
Log entries for 20.1/20.2.

Docs had drifted after Task 18 (Tasks 19, 20.1, 20.2 shipped without a
doc update, per an explicit decision to batch this catch-up). This
pass reconciles `STATUS.md`/`TASKS.md`/`DECISIONS.md` against the
actual repo state for 19, 20.1, 20.2, and 20.3 all at once — no other
code changed as part of this reconciliation.

Before Task 20: **Task 19 — ErrorGroupDetail page** (AI panel as
checklist, event list, sparkline), backed by a new
`errorGroupService.getGroupDetail`/`groupController.getGroupDetail`
(`GET /api/groups/:id`, same ownership-check pattern as Task 18's
status update). Before that: **Task 18 — Status update endpoint +
UI**, closing out Milestone 4.

**(Task 18 detail, unchanged this pass — condensed here; full detail
in `DECISIONS.md`):** `errorGroupService.updateGroupStatus` enforces
ownership via a scoped `Project.findOne`, pushes a `statusHistory`
entry, never touches `lastSeen`. `groupController.updateStatus`
validates `status` against the enum before calling the service.
`PATCH /api/groups/:id/status` mounted behind JWT `authMiddleware`.

**Verified this pass (Task 20.3 only — 20.1/20.2/19 were verified in
their own original passes; full history in `DECISIONS.md`'s Shipped
Log):**
- Direct in-process call against `projectController` (fake `req`/`res`,
  no Express/DB): all four new validation branches (non-string `name`
  on create, non-string `githubRepo` on create, non-string `name` on
  update, empty-string `name` on update) return `400` before
  `projectService` is ever called.
- Server: `npm test` — all 19 tests still pass unchanged.
- `projectController.js` loads without throwing.

**Manual test still owed for Task 20.3 specifically:** the four `400`
branches above were only exercised in-process (no live server/DB in
this sandbox) — copy-pasteable manual test instructions are provided
below for the user to confirm against a live local server.

Tasks 17/18/19/20.1/20.2 remain closed exactly as previously recorded
— no changes to any of them this pass; full detail in `DECISIONS.md`.

Next up: **Task 21** — payload size caps (rate limiting was already
pulled forward and shipped ahead of schedule — see `DECISIONS.md`'s
"Rate limiting: login and ingestion" entry). Not started. This is the
next unchecked box in Milestone 5.

## Constitution Amendments

- **Prior pass** — `PROJECT_RULES.md` §4/§8 amended at the user's
  explicit request: every session must now hand off (a) complete
  final contents of every changed file (not a diff/patch — the
  implementation sandbox is a separate filesystem from the user's real
  repo), with a narrow exception for large files where only one
  bounded section changed, and (b) detailed, copy-pasteable manual
  test instructions (exact commands, exact pass/fail signal), with
  honest disclosure when a test genuinely couldn't be run in-session.
- **Prior pass** — `PROJECT_RULES.md` §4 further amended: before
  starting implementation on a subtask, state a recommended effort
  level and whether extended thinking should be on, with a one-line
  reason. A recommendation for the user to set, not something Claude
  toggles itself.

## Known Open Issues

- **Atlas dev-cluster password rotation** — pending since Task 2.1,
  carried across multiple sessions. Still not done.
- **`extractErrorType()`'s generic `"Error"` bucket** for
  non-conventional error names — documented limitation, not a bug
  (see `DECISIONS.md`, "Fingerprint = hash(error type + normalized
  stack signature)").
- **`githubService`'s file-path heuristic** isn't guaranteed to match
  a given repo's real folder layout — a mismatch 404s and falls back
  to stack-trace-only grounding, never a hard failure (see
  `DECISIONS.md`, "githubService: snippet windowing + optional
  GITHUB_TOKEN").
- **Manual re-verification of the previous (Task 17) pass's changes is
  still owed**, carried forward unresolved: rate limiter thresholds,
  `apiKeyMiddleware`'s 5 cases post-refactor, response-shape
  byte-for-byte diffing, and the new Mongo index have not been run
  against a live Atlas cluster by the user yet either.

## Currently-Relevant Locked-In Decisions

Pointers only — see `DECISIONS.md` for full reasoning:

- Dedup uses atomic `findOneAndUpdate` upsert, not read-then-write ("Atomic upsert dedup: `findOneAndUpdate` before read-then-write").
- AI enrichment is fire-and-forget, dispatched after the ingestion response is sent, only for new groups (`AI_CONTEXT.md`'s Dispatch Model — wired in Task 13, in `ingestController` + `errorGroupService.enrichErrorGroup`; see `DECISIONS.md`'s "errorGroupService.enrichErrorGroup: orchestration lives in errorGroupService, not aiService (Task 13)").
- AI confidence is derived programmatically as a binary value (`0.8` grounded / `0.4` ungrounded), never self-reported by the LLM ("Task 14: confidence values and affectedFile/affectedFunction source").
- `aiService` is pure functions, not a 4-class provider hierarchy ("aiService: package and model choice").
- API-key auth (ingestion) and JWT auth (dashboard) are deliberately separate middleware ("API key hashing: SHA-256, not bcrypt").
- Raw fetched GitHub source snippets are never persisted ("githubService: snippet windowing + optional GITHUB_TOKEN").
- `apiKeyMiddleware`'s inert `timingSafeEqual` check was removed this pass — the hash-indexed `findOne` lookup is the actual security boundary ("apiKeyMiddleware: removal of inert timingSafeEqual check").
- The `httpResponse` helper (`sendSuccess`/`sendError`) is response-shaping only — a separate concern from the `AppError`/`catchAsync`/`errorMiddleware` trio Task 20 added; both are now in place and used together throughout controllers ("`httpResponse` helper: response-shaping only, not Task 20").
- `PATCH /api/groups/:id/status` enforces ownership via a scoped `Project.findOne({ _id, ownerId })` after looking up the group, not a fetch-then-compare — `ErrorGroup` has no `ownerId` field to scope on directly ("Task 18: ownership check for group status updates").
- `statusHistory` is appended to, never overwritten, and a status PATCH never bumps `lastSeen` (dedup-specific semantics stay unrelated to status edits — see "ErrorGroup uses firstSeen/lastSeen instead of Mongoose timestamps").
- `AppError`/`catchAsync`/centralized `errorMiddleware` are now the standard for every controller; the one exception is the local `CastError`→resource-specific-404 translation kept in `projectController`/`groupController` ("Task 20.1"/"Task 20.2" Shipped Log entries).
- `projectController.createProject`/`updateProject` typeof-guard `name`/`githubRepo` before calling the service; `githubRepo`'s format stays exclusively a schema-level (`Project.js`) concern ("Task 20.3: project input validation — closing the typeof gap").

## Where Things Live

- Blueprint / design review: repo root (or wherever the architecture
  review doc is kept) — treat as final, do not redesign.
- Living docs: `/docs`
- Server code: `/server`
- Client code: `/client` (Vite + React scaffold as of Task 15; real UI pages — Login/Register/Dashboard/ProjectDetail/GroupDetail — since Tasks 16-19)