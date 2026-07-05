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

Task numbering and full checklist: `TASKS.md`. This section only
states current position, not a restated description of every task —
that would duplicate `TASKS.md`.

## What's Actively In Progress

Nothing mid-implementation as of this pass. Most recently completed:
**Task 18 — Status update endpoint + UI**, closing out Milestone 4.

**Server:** `errorGroupService.updateGroupStatus({ ownerId, groupId,
status })` (new) — fetches the `ErrorGroup` by id, then enforces
ownership via a scoped `Project.findOne({ _id: group.projectId,
ownerId })` (not a fetch-then-compare on a fetched project's
`ownerId`), pushes a `statusHistory` entry, and saves. Never touches
`lastSeen` (dedup-specific field, unrelated to a status edit).
`groupController.updateStatus` (new) validates `status` is one of
`open`/`resolved`/`ignored` before calling the service, and collapses
group-not-found / not-yours / malformed-`:id` into the same 404 used
everywhere else. `groupRoutes.js` (new) mounts
`PATCH /api/groups/:id/status` under `/api/groups` in `app.js`, behind
the same JWT `authMiddleware` as project routes. Full reasoning for the
ownership-check design (and the two alternatives rejected) is in
`DECISIONS.md`'s "Task 18: ownership check for group status updates."

**Client:** `src/pages/ProjectDetailPage.jsx`'s status column changed
from static text to a `<select>` (`open`/`resolved`/`ignored`) wired to
the new PATCH. Only the row being changed disables during its request
(`updatingGroupId`); a page-level `statusError` surfaces a failed PATCH
without touching the initial-load `error` state. Local `groups` state
is only updated after the PATCH succeeds — never optimistically before
the response — so a failed request can't leave the UI showing a status
the server didn't actually record.

**Verified this pass:**
- Server: `npm test` — all 16 tests pass, including 3 new
  `updateGroupStatus` unit tests (owned-group happy path with
  `statusHistory` append, group-not-found short-circuits before
  querying `Project`, group-exists-but-not-yours never saves) — same
  monkey-patched-Mongoose-model approach as the file's existing tests
  (no live Mongo in this sandbox).
- Server: `app.js` loads without throwing with `groupRoutes` mounted
  (confirms the new route wiring doesn't break app construction).
- Client: `npm run build` succeeds (89 modules, no errors).

**Manually verified by the user against a live local server + Atlas,
this pass:** the two-call PATCH sequence (`resolved` then `ignored` on
the same group) — `statusHistory` accumulated to 2 entries rather than
being overwritten, and `lastSeen` stayed unchanged across both calls;
bad `status` value correctly returned `400`; a nonexistent group id
correctly returned `404`; the dashboard `<select>` persisted a status
change across a full page refresh, confirming it round-trips through
the server rather than only updating local state. Task 18 is fully
closed — no outstanding verification owed for this task.

Before this: Task 17 — Dashboard + ProjectDetail pages (project list,
error group table), including the mid-task addition of
`GET /api/projects/:id/groups` (manually verified working end-to-end
by the user against a live local server, per the prior pass).

Next up: **Task 19** — ErrorGroupDetail page (AI panel as checklist,
event list, sparkline). Not started. This is the first task in
Milestone 5.

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
- The response-shaping helper (`sendSuccess`/`sendError`) added this pass is explicitly not the Task 20 `AppError`/`catchAsync` refactor ("`httpResponse` helper: response-shaping only, not Task 20").
- `PATCH /api/groups/:id/status` enforces ownership via a scoped `Project.findOne({ _id, ownerId })` after looking up the group, not a fetch-then-compare — `ErrorGroup` has no `ownerId` field to scope on directly ("Task 18: ownership check for group status updates").
- `statusHistory` is appended to, never overwritten, and a status PATCH never bumps `lastSeen` (dedup-specific semantics stay unrelated to status edits — see "ErrorGroup uses firstSeen/lastSeen instead of Mongoose timestamps").

## Where Things Live

- Blueprint / design review: repo root (or wherever the architecture
  review doc is kept) — treat as final, do not redesign.
- Living docs: `/docs`
- Server code: `/server`
- Client code: `/client` (Vite + React scaffold as of Task 15; real UI pages — Login/Register/Dashboard/ProjectDetail — since Tasks 16-18)