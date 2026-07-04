# Faultline — Status

> Single source of truth for "where are we, right now." Edited in
> place, never regenerated wholesale (see `PROJECT_RULES.md` §3 for
> why the old two-file `PROJECT_CONTEXT.md`/`HANDOFF.md` split was
> retired in favor of this one file). Read order for a new session:
> `PROJECT_RULES.md` → this file → `TASKS.md`.

## Current Milestone / Task

- **Milestone 1 — Backend Foundation:** COMPLETE (4/4 tasks)
- **Milestone 2 — Projects & Ingestion:** COMPLETE (6/6 tasks)
- **Milestone 3 — AI Enrichment:** in progress (2/4 tasks — Tasks 11
  and 12 done; Task 13 next, Task 14 after that)

Task numbering and full checklist: `TASKS.md`. This section only
states current position, not a restated description of every task —
that would duplicate `TASKS.md`.

## What's Actively In Progress

Nothing mid-implementation as of this pass. The most recent completed
work was the Foundation-Hardening & Documentation Re-Engineering pass
(this pass) — Workstream 2 restructured the documentation system
(this file included), and Workstream 1 closed a set of bugs, security
gaps, one maintainability item, and one automated test against the
Milestone 1–3 codebase. See `DECISIONS.md`'s newest entries for what
changed and why; see the "Shipped Log" at the bottom of `DECISIONS.md`
for the plain changelog of this pass.

Next up: **Task 13** — wire `aiService` + `githubService` together
into the ingestion "new group" path, fire-and-forget. Not started.

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
- **Git state not independently confirmed.** No commit/push from the
  prior AI-enrichment session (Tasks 9.2/9.3/10/11/12) was confirmed
  by the user in that session's chat transcript. Assume nothing past
  Task 8 is actually committed until verified locally with `git log`
  / `git status`, and run the suggested commits below in order if
  they aren't there yet:
  - `feat(9.3): wire fingerprintService + atomic upsert dedup into ingestController` (bundled with 9.2's model)
  - `feat(10): add demo Express app, verify dedup end-to-end`
  - `feat(11): add aiService (buildPrompt/callGemini/parseAndValidate)`
  - `feat(12): add githubService for GitHub Contents API grounding`
  - Plus this pass's commits — see this pass's summary for the full list.
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
- AI enrichment will be fire-and-forget, dispatched after the ingestion response is sent (`AI_CONTEXT.md`'s Dispatch Model; not yet wired — that's Task 13).
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
