# Faultline — Status

> Single source of truth for "where are we, right now." Edited in
> place, never regenerated wholesale (see `PROJECT_RULES.md` §3 for
> why the old two-file `PROJECT_CONTEXT.md`/`HANDOFF.md` split was
> retired in favor of this one file). Read order for a new session:
> `PROJECT_RULES.md` → this file → `TASKS.md`.

## Current Milestone / Task

- **Milestone 1 — Backend Foundation:** COMPLETE (4/4 tasks)
- **Milestone 2 — Projects & Ingestion:** COMPLETE (6/6 tasks)
- **Milestone 3 — AI Enrichment:** in progress (3/4 tasks — Tasks 11,
  12, and 13 done; Task 14 next)

Task numbering and full checklist: `TASKS.md`. This section only
states current position, not a restated description of every task —
that would duplicate `TASKS.md`.

## What's Actively In Progress

Nothing mid-implementation as of this pass. Most recently completed:
**Task 13** — `errorGroupService.enrichErrorGroup` now wires
`githubService.fetchCodeSnippet` + `aiService.{buildPrompt,callGemini,
parseAndValidate}` together (parses the stack via `stackNormalizer`,
fetches a snippet only when `project.githubRepo` is set, saves
`aiSummary: { rootCause, severity, suggestedFix }` on success, leaves
it `null` on any failure). Dispatched fire-and-forget from
`ingestController` after the 202 response, only when `isNewGroup` is
true, never `await`-ed in the request cycle. Unit tests added
(`errorGroupService.test.js`) mocking `githubService`/`aiService`/
`ErrorGroup.findByIdAndUpdate` — **not yet run**, since this sandbox
has no `node_modules` installed and no network access to `npm
install`; run `npm test` locally before considering this closed. Live
manual verification against real Gemini/GitHub calls also still owed
(see this task's handoff notes).

Before this: the Foundation-Hardening & Documentation Re-Engineering
pass — Workstream 2 restructured the documentation system (this file
included), and Workstream 1 closed a set of bugs, security gaps, one
maintainability item, and one automated test against the Milestone
1–3 codebase. See `DECISIONS.md`'s newest entries for what changed and
why; see the "Shipped Log" at the bottom of `DECISIONS.md` for the
plain changelog of that pass.

Next up: **Task 14** — derived confidence score +
affectedFile/affectedFunction fields. Not started.

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
- AI confidence will be derived programmatically, never self-reported by the LLM ("aiService: package and model choice").
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