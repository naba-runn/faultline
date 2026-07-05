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
- **Milestone 4 — Dashboard Auth & Core Pages:** IN PROGRESS (3/4 tasks)

Task numbering and full checklist: `TASKS.md`. This section only
states current position, not a restated description of every task —
that would duplicate `TASKS.md`.

## What's Actively In Progress

Nothing mid-implementation as of this pass. Most recently completed:
**Task 17 — Dashboard + ProjectDetail pages (project list, error group
table).**

**Blocker found and resolved mid-task:** `API.md`'s "Not Yet
Implemented" list still had `GET /api/projects/:id/groups`, and
confirmed against the actual server code — no route/controller for it
existed, only the `ErrorGroup` model and the enrichment service used
internally by ingestion. Rather than build client pages against a
non-existent endpoint, stopped and asked; user chose to build the
endpoint first. Added: `errorGroupService.listErrorGroups(projectId)`
(shapes each group down for a list view — omits `stackSample`; when
`aiSummary` exists, includes only `severity`/`rootCause`, not
`suggestedFix`/`confidence`/`affectedFile`/`affectedFunction`, which
stay reserved for the not-yet-built `GET /api/groups/:id` that Task
19's ErrorGroupDetail will use), `projectController.listProjectGroups`
(reuses `projectService.getProject` for the ownership check, same
not-found-or-not-yours-collapse-to-404 pattern as every other project
route), and the `GET /:id/groups` route in `projectRoutes.js`. Full
reasoning in `DECISIONS.md`'s "Task 17: GET /api/projects/:id/groups
built mid-task" entry.

**Client:** `src/pages/DashboardPage.jsx` now lists projects
(`GET /api/projects`) and has a create-project form
(`POST /api/projects`), showing the one-time raw API key on success —
this overwrote Task 16's placeholder dashboard, called out per §5.
`src/pages/ProjectDetailPage.jsx` (new) shows project info plus the
error group table via the two GETs above. `App.jsx` gained a
`/projects/:id` protected route. List view only — no drill-into-one-
group page or status changes (Tasks 18-19 respectively).

**Verified this pass:**
- Server: `npm test` — all 13 tests pass, including 3 new
  `listErrorGroups` unit tests (filter/sort correctness, list-shaping,
  aiSummary field-trimming), same monkey-patched-Mongoose-model
  approach as the file's existing tests (no live Mongo in this
  sandbox).
- Client: `npm run build` succeeds (89 modules, no errors).

**Not verified:** any live behavior against a real running server +
Atlas — confirmed via a direct connection attempt that this sandbox
has no network path to Atlas (times out; only npm/GitHub registries
are allow-listed), so this is a hard sandbox limitation, not
something skipped. Unexercised in-session: the actual HTTP round-trip
for `GET /api/projects/:id/groups` end-to-end, the Dashboard's create-
project flow displaying a real API key, and the ProjectDetail table
rendering real error groups (including the `aiSummary` severity
column against groups that do vs. don't have one yet). See this
task's manual test instructions for what to run locally.

Before this: Task 16 — Login/Register pages, `ProtectedRoute`
(manually verified working end-to-end by the user against a live
local server).

Next up: **Task 18** — Status update endpoint + UI. Not started.

## Constitution Amendments

- **This pass** — `PROJECT_RULES.md` §4/§8 amended at the user's
  explicit request: every session must now hand off (a) complete
  final contents of every changed file (not a diff/patch — the
  implementation sandbox is a separate filesystem from the user's real
  repo), with a narrow exception for large files where only one
  bounded section changed, and (b) detailed, copy-pasteable manual
  test instructions (exact commands, exact pass/fail signal), with
  honest disclosure when a test genuinely couldn't be run in-session.
- **This pass** — `PROJECT_RULES.md` §4 further amended: before
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
- **Git state confirmed clean.** Verified locally via `git log` /
  `git status`: Tasks 9.2/9.3/10/11/12 plus this pass's changes are
  all committed on `refactor-v2` (tip `3f4c45d "Major refactor"`),
  branch is up to date with `origin/refactor-v2`, working tree clean.
- **Manual re-verification of this pass's changes is still owed.**
  Everything in this pass was implemented and unit-tested where
  stated, but the live-server manual checks listed in this pass's
  summary (rate limiter thresholds, `apiKeyMiddleware`'s 5 cases
  post-refactor, response-shape byte-for-byte diffing, the new Mongo
  index) have not been run against a live Atlas cluster by the user
  yet — do that before marking this pass fully closed.

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

## Where Things Live

- Blueprint / design review: repo root (or wherever the architecture
  review doc is kept) — treat as final, do not redesign.
- Living docs: `/docs`
- Server code: `/server`
- Client code: `/client` (Vite + React scaffold as of Task 15; no real UI pages yet — Task 16)