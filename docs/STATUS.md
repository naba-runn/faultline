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

Task numbering and full checklist: `TASKS.md`. This section only
states current position, not a restated description of every task —
that would duplicate `TASKS.md`.

## What's Actively In Progress

Nothing mid-implementation as of this pass. Most recently completed:
**a full audit of Tasks 1-14**, per `PROJECT_RULES.md` §13's every-10
cadence (already overdue). Core logic — auth, projects, ingestion,
dedup, AI enrichment — all confirmed correct against the actual code,
no functional bugs found there. Found and fixed one real code gap
(`Project.apiKeyHash` had no index — added `unique: true`) and six
documentation-drift items (`.env.example` missing `GITHUB_TOKEN`,
`API.md`'s ingestion section describing the pre-Task-13 world,
`ARCHITECTURE.md`'s folder tree and Request Flow section stuck at
Milestone 1, `DATABASE.md`'s stale header + a broken leftover section,
and a stray garbled clause on `TASKS.md`'s Task 15 line that an
earlier pass had incorrectly claimed was already removed). Full
findings and fixes logged in `DECISIONS.md`'s Shipped Log, "Audit
session (Tasks 1-14)" entry.

**Not re-run:** `npm test` and any live server checks — this audit was
static (code + docs cross-referenced by reading, not executing), same
sandbox limitation as every prior pass (no `node_modules`, no
network). Run `npm test` locally once after pulling in the
`apiKeyHash` schema change — building a unique index against existing
Atlas data is the one part of this pass worth confirming succeeds
cleanly (should be a non-issue: 256-bit random keys make a real
collision astronomically unlikely).

Milestone 3 (AI Enrichment) is fully complete (4/4). Next audit due
per cadence after Task 24 — the last task on the roadmap.

Before this: Task 14 — derived confidence score +
affectedFile/affectedFunction fields.

Next up: **Task 15** — React scaffold, `AuthContext`, axios instance
with interceptor. Not started.

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
- Client code: `/client` (not yet scaffolded — Task 15)