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
- **Milestone 5 — Detail View & Polish:** IN PROGRESS (5/6 tasks — 19, 20, 21, 22, 23 done)
- **Milestone 6 — Reliability & Real-Time Infrastructure:** IN PROGRESS (1/3 tasks — 25 done)
- **Milestone 7 — Alerting & Insights:** NOT STARTED (0/5 tasks)
- **Milestone 8 — Product Polish & Growth:** NOT STARTED (0/4 tasks)
- **Milestone 9 — Ship:** NOT STARTED (0/1 task — original Task 24, renumbered to Task 37)

Milestones 6-9 are a scope expansion agreed on after Task 23, before
starting the original Task 24. Full reasoning, ordering rationale, and
alternatives considered: `DECISIONS.md`'s "Scope expansion: Milestones
6-9" entry.

Task numbering and full checklist: `TASKS.md`. This section only
states current position, not a restated description of every task —
that would duplicate `TASKS.md`.

## What's Actively In Progress

Nothing mid-implementation as of this pass. Most recently completed:
**Task 25 — background job queue (BullMQ + Render Key Value), separate
`worker.js` process, AI enrichment migrated off fire-and-forget onto
it with retry/backoff.** `ingestController` and
`projectController.simulateError` now enqueue an enrichment job
instead of calling `enrichErrorGroup` directly; the actual AI call now
happens in a genuinely separate process. `enrichErrorGroup`'s error
contract inverted as part of this — it used to swallow every failure
internally (nowhere to send one from fire-and-forget); it now
propagates retryable failures (Gemini API errors, transient Mongo
write failures) so BullMQ's retry/backoff can act on them, while
keeping a Gemini-response-failed-our-own-validation outcome terminal
(not retried — retrying an identical prompt against identical input
won't produce a different result). Full reasoning, alternatives
considered, and the real-infrastructure verification performed (a
local Redis was installed in-sandbox and two integration checks were
run against real BullMQ Queue/Worker instances, not just mocks) are in
`DECISIONS.md`'s "Task 25" entry.

**Known consequence, not a bug:** local dev now needs two processes
running for enrichment to actually happen — `npm run dev` (API) and
`npm run worker:dev` (worker) — not one. Without the worker running,
jobs queue up in Redis and wait; nothing is lost, but no `ErrorGroup`
gets an `aiSummary` until a worker consumes the queue.

**Not yet done:** `server/.env`'s `REDIS_URL` currently points at a
local Redis placeholder (a real Render Key Value instance couldn't be
provisioned in this pass) — needs provisioning and swapping in before
Task 37's deploy step.

Before that: **Task 23 — dark theme, monospace tokens, table layout,
"Simulate Error" demo button.** Two parts: (1) a new global stylesheet
(`client/src/index.css`) applying a dark graphite/teal token system —
monospace specifically for data (error messages, stacks, counts,
timestamps, the API key), sans for UI chrome, severity/status as
colored pill badges — across all five client pages; (2) a
`POST /api/projects/:id/simulate` endpoint (JWT-authed, ownership-
scoped) backing the button, which reused (at the time)
`errorGroupService.recordEvent`/`enrichErrorGroup` directly — now
updated by Task 25 above to enqueue instead. Full reasoning in
`DECISIONS.md`'s "Task 23" entry.

**Known consequence, not a bug:** simulated errors' canned fake file
paths never match a real project's `githubRepo`, so simulated-error AI
enrichment always falls back to stack-trace-only confidence (`0.4`),
never the GitHub-grounded `0.8` — use the real `demo-app` to exercise
grounded enrichment specifically.

Before that: **Task 22 — Cursor pagination on the group list endpoint**
(`errorGroupService.listErrorGroups` now takes `{ limit, cursor }`,
returns `{ groups, nextCursor }`; sorted on `{ lastSeen: -1, _id: -1 }`
with `_id` as a tie-breaker for rows sharing a `lastSeen` millisecond;
`projectController.listProjectGroups` passes query params through and
translates invalid-limit/invalid-cursor into `400`s). Full reasoning
in `DECISIONS.md`'s "Task 22: cursor pagination on the group list
endpoint" entry. **Known consequence, not a bug:** the frontend
doesn't send `limit`/`cursor` or read `nextCursor` yet, so any project
with over 20 groups only shows its first page in the UI until the
client is updated — see Known Open Issues below.

Before that: **Task 21 — Payload size caps.** Rate limiting itself was
already pulled forward and shipped ahead of schedule in an earlier
pass; what remained was field-level length caps on ingestion:
`message` (≤1000 chars) and `stack` (≤10,000 chars) in
`ingestController.ingestEvent`, returning `400` when exceeded.
Deliberately doesn't touch `env`/`metadata` — their lack of validation
is an existing, separate, already-settled decision (accept-but-ignore,
forward-compatible), not something this task reopens. Full detail in
`DECISIONS.md`'s Shipped Log.

Also fixed this pass (unplanned, found at session start): **`client/src/App.jsx`
had been accidentally overwritten with a near-verbatim copy of
`server/app.js`** during the Task 20.2 commit — the client had no real
React `App` component, so the page rendered blank (`require` isn't
defined in the browser). `server/app.js` itself was untouched and
correct the whole time; this was a stray copy-paste into the wrong
file, not a missing edit to `app.js`. Restored from git history (the
commit immediately before the corrupting one). Full detail in
`DECISIONS.md`'s Shipped Log.

Before all of the above: **Task 20 — Centralized error middleware
(AppError + catchAsync) + validation pass**, across three subtasks:

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

**Manual test status:**
- Task 23: `projectController.js`/`projectRoutes.js` verified to load
  without throwing; 22-test server suite passes unchanged (no existing
  test touches `projectController`). All client `.jsx` files verified
  to parse cleanly via a Babel JSX transform run outside the sandboxed
  `node_modules` (whose native Rollup/esbuild binaries are built for a
  different platform than this environment, so a real `vite build`
  couldn't be run here — see this pass's manual test instructions for
  what's owed against a live dev server: visual review of the theme,
  the Simulate Error button's full click → new-group/duplicate →
  table-update flow, and badge rendering for each severity/status
  value).
- Task 20.3's four `400` branches: exercised in-process only in their
  original pass; still owed against a live server (unchanged this
  pass).
- Task 21: verified in-process (both new `400` branches, boundary case
  passes validation) **and** confirmed by the user against a live
  local server this pass.
- Task 22: verified in-process/unit-test only (22-test suite,
  including 3 new tests for `hasMore`/`nextCursor`, invalid-limit, and
  invalid-cursor) **and** confirmed by the user against a live local
  server — first page, `limit=1` forcing a next page, following
  `nextCursor` to a second distinct group (via the demo-app's
  `/crash/range-error` route, after correcting a `demo-app/.env`
  `FAULTLINE_API_KEY` mismatch that had been reporting into a
  different project than the one under test — not a pagination bug,
  a local config mismatch), and both invalid-limit/invalid-cursor
  `400` cases.
- App.jsx fix: verified by inspection (diff against the pre-corruption
  git blob) plus a description of the expected browser-side symptom;
  not yet confirmed fixed in the user's actual browser as of this
  writing.

Tasks 17/18/19/20.1/20.2 remain closed exactly as previously recorded
— no changes to any of them this pass; full detail in `DECISIONS.md`.

Next up: **Task 26** — Real-time push to dashboard via Server-Sent
Events, using a short-lived single-use ticket for auth (native
`EventSource` can't send an `Authorization` header, and this app's
`morgan` request logging would otherwise write a JWT-in-query-string
to plaintext server logs — see `DECISIONS.md`'s "Scope expansion"
addendum for the full reasoning). Not started. Second task of
Milestone 6 — depends on Task 25's Redis connection (the ticket needs
somewhere short-lived to live) and now that Task 25 is done, this is
unblocked.

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
- **Task 22's pagination isn't consumed by the frontend yet** —
  `ProjectDetailPage.jsx` calls `GET /api/projects/:id/groups` with no
  `limit`/`cursor` and never reads `nextCursor` back. Any project with
  more than 20 error groups (the default page size) will only ever
  show its first page in the dashboard until the client is updated to
  paginate. Backend-only was the intended scope for Task 22 per the
  roadmap — this is a known, currently-live consequence of that scope,
  not a bug, but it's unresolved and worth fixing before relying on
  the dashboard for a project with real volume.
- **`demo-app/.env`'s `FAULTLINE_API_KEY` may not match the project
  currently under manual test** — discovered during Task 22's manual
  verification: the demo-app was silently reporting into a different
  project than the one being queried, which looked like a pagination
  bug (a new error group "wasn't showing up") but was actually a local
  config mismatch. Worth double-checking this file's key against
  whichever project you're testing before assuming a pagination/dedup
  issue is a real bug.
- **`server/.env`'s `REDIS_URL` points at a local Redis placeholder, not
  a real Render Key Value instance** — a real one couldn't be
  provisioned in the Task 25 pass (no way to create a Render account
  resource from this environment). Needs provisioning and swapping in
  before Task 37's deploy step; local dev works fine against a local
  Redis in the meantime.
- **Local dev now requires two processes running for AI enrichment to
  actually happen** — `npm run dev` (API) and, separately,
  `npm run worker:dev` (the Task 25 worker). Without the worker
  running, enrichment jobs queue up in Redis and wait (nothing lost),
  but no `ErrorGroup` gets an `aiSummary` until a worker consumes the
  queue. Easy to forget when testing Task 26+ features that expect
  enrichment to complete.
- **Simulated errors (Task 23's "Simulate Error" button) never exercise
  GitHub-grounded AI enrichment** — the canned fake file paths
  (`/app/src/services/...`) won't match any real project's
  `githubRepo`, so `enrichErrorGroup` always falls back to stack-
  trace-only confidence (`0.4`) for these. Expected, not a bug — use
  the real `demo-app` (whose stack traces can be made to match an
  actual linked repo) to test grounded enrichment specifically.
- **Task 23's theme/button changes have not yet been visually confirmed
  in a real browser against a live server** — this pass verified
  syntax (all `.jsx` parse cleanly via Babel, run outside the sandboxed
  `node_modules` whose native binaries target a different platform than
  this environment) and that the server-side pieces load/test cleanly,
  but the actual rendered dark theme, badge colors, and the Simulate
  Error button's end-to-end click flow are still owed a live check —
  see this pass's manual test instructions.

## Currently-Relevant Locked-In Decisions

Pointers only — see `DECISIONS.md` for full reasoning:

- Dedup uses atomic `findOneAndUpdate` upsert, not read-then-write ("Atomic upsert dedup: `findOneAndUpdate` before read-then-write").
- AI enrichment is enqueued as a BullMQ job and processed by a separate `worker.js` process, only for new groups — not called directly/fire-and-forget as it was before Task 25 (`AI_CONTEXT.md`'s Dispatch Model — originally wired in Task 13, updated in Task 25; see `DECISIONS.md`'s "Task 25" entry and its "errorGroupService.enrichErrorGroup: orchestration lives in errorGroupService, not aiService (Task 13)" entry).
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
- `POST /api/events` caps `message`/`stack` at 1000/10,000 characters — a field-level concern separate from the global 100kb body cap; `env`/`metadata` remain deliberately uncapped (Task 21 Shipped Log entry).
- `GET /api/projects/:id/groups` paginates via an opaque `{lastSeen, _id}` cursor, not offset/skip or `lastSeen` alone — `_id` is a required tie-breaker since `lastSeen` isn't guaranteed unique ("Task 22: cursor pagination on the group list endpoint").
- `POST /api/projects/:id/simulate` (JWT, ownership-scoped) reuses the exact same `errorGroupService.recordEvent` call and (as of Task 25) the same `enrichmentQueue.enqueueEnrichment` enqueue the real ingestion path uses, rather than exposing or reconstructing a project's one-way-hashed API key ("Task 23: dark theme + monospace tokens + table polish, and `POST /api/projects/:id/simulate`"; enqueue behavior updated in "Task 25").
- AI enrichment is enqueued as a BullMQ job (`services/enrichmentQueue.js`), consumed by a separate `worker.js` process — not called directly, fire-and-forget, as it was before Task 25. `enrichErrorGroup` now throws on retryable failures (propagates for BullMQ's retry/backoff) instead of swallowing everything internally; a Gemini-response-fails-validation outcome stays terminal/non-throwing ("Task 25: background job queue...").

## Where Things Live

- Blueprint / design review: repo root (or wherever the architecture
  review doc is kept) — treat as final, do not redesign.
- Living docs: `/docs`
- Server code: `/server`
- Client code: `/client` (Vite + React scaffold as of Task 15; real UI pages — Login/Register/Dashboard/ProjectDetail/GroupDetail — since Tasks 16-19)