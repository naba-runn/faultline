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
- **Milestone 4 — Dashboard Auth & Core Pages:** IN PROGRESS (2/4 tasks)

Task numbering and full checklist: `TASKS.md`. This section only
states current position, not a restated description of every task —
that would duplicate `TASKS.md`.

## What's Actively In Progress

Nothing mid-implementation as of this pass. Most recently completed:
**Task 16 — Login/Register pages, `ProtectedRoute`.** Added
`react-router-dom` (first introduced this task — deliberately not
added in Task 15, since it wasn't needed until real routing was).
`src/App.jsx` now defines routes for `/login`, `/register`, and a
`/dashboard` gated by the new `src/components/ProtectedRoute.jsx`
(redirects to `/login` unless `AuthContext`'s `isAuthenticated` is
true; shows a loading state instead of bouncing a logged-in user while
the Task 15 bootstrap check is in flight). `src/pages/LoginPage.jsx`
and `RegisterPage.jsx` are forms wired to `AuthContext`'s existing
`login`/`register` methods, surfacing the server's `error` string on
failure per `API.md`'s auth error tables. `src/pages/DashboardPage.jsx`
is a placeholder behind the guard (real content in Task 17) — Task
15's old wiring-check `App.jsx` was overwritten by this task's real
routing, called out explicitly per §5.

**Verified this pass:** `npm install` + `npm run build` both succeed
in the sandbox (88 modules, no errors). **Not verified:** any live
behavior against the running Express API — no server process in this
sandbox. In particular, unexercised in-session: the login/register
forms' actual round-trip to `/api/auth/login` and `/api/auth/register`,
`ProtectedRoute`'s redirect behavior in a real browser session, and the
logout button's effect on subsequent requests. See this task's manual
test instructions for what to run locally to close that gap.

Before this: Task 15 — React scaffold, `AuthContext`, axios instance
with interceptor (manually verified working end-to-end by the user
against a live local server, after resolving a port mismatch — client
defaulted to `:5000`, actual server was on `:5050`).

Next up: **Task 17** — Dashboard + ProjectDetail pages (project list,
error group table). Not started.

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