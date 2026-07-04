# Faultline — Handoff
Session: 15 — 4 July 2026
<!-- Regenerated in full at each session boundary. This file plus
PROJECT_RULES.md should be sufficient to resume work without opening
any other doc. Policy: PROJECT_RULES.md §3, §10–§13. -->

## Where Things Stand
Milestone 2 — Projects & Ingestion: **COMPLETE** (6 of 6 tasks).
Milestone 3 — AI Enrichment: in progress (2 of 4 tasks done).
Task: 13 — Wire AI enrichment into "new group" path, fire-and-forget (not started, next up).

This session closed Task 9 (9.2 ErrorEvent model, 9.3 wiring dedup
into `ingestController` — 9.1 was already done coming in), Task 10
(demo Express app, verified dedup end-to-end live), Task 11
(`aiService`: `buildPrompt`/`callGemini`/`parseAndValidate`), and Task
12 (`githubService`: GitHub Contents API fetch for grounding). All
four were manually tested live by the user and confirmed matching
before docs were finalized.

⚠ **Process note, not a code bug:** mid-session I miscounted
Milestone 2's progress line in a `PROJECT_CONTEXT.md` diff (wrote
"5 of 6" when Task 10 finishing made it 6 of 6 / COMPLETE). The user
caught it and I issued a corrected diff. **Confirm `PROJECT_CONTEXT.md`
actually reads "COMPLETE (6 of 6)" for Milestone 2** before trusting it
— this is exactly the kind of thing worth a quick look rather than
assuming the correction landed cleanly on top of the original mistake.

⚠ **Unverified status, structural:** every doc diff this session
(`DATABASE.md`, `AI_CONTEXT.md`, `DECISIONS.md`, `ARCHITECTURE.md`,
`TASKS.md`, `CHANGELOG.md`, `INTERVIEW_NOTES.md`, `PROJECT_CONTEXT.md`)
was handed to the user as a diff in chat, per their standing
instruction to apply docs only after their own manual test passed.
Manual *code* tests were confirmed live, turn by turn. The *doc edits
themselves* were never independently re-read by me afterward — I have
no filesystem access to their actual repo. Reasonably likely they all
landed correctly (the user has been carefully pasting back file
contents to check things, e.g. `.env.example`), but **a future session
should not assume every doc file matches what was diffed** without at
least a spot check, the same caution as the Milestone 2 line above.

⚠ **Known doc gap, flagged not fixed (matters before Task 14):**
`AI_CONTEXT.md`'s prose describes `confidence` as `"high"`/`"low"`
strings; `ErrorGroup.js`'s Task-9.1 `aiSummarySchema` defines it as
`Number, min: 0, max: 1`. Code is ground truth. Noted in `DECISIONS.md`
and `AI_CONTEXT.md` itself — fix before Task 14 assigns a value to it.

**Known limitation, not a bug:** `githubService.fetchCodeSnippet`'s
file path comes from `stackNormalizer.normalizeFilePath()`'s
root-marker heuristic — not guaranteed to match a given GitHub repo's
actual folder layout. A mismatch just 404s and falls back to
stack-trace-only grounding (`confidence: low` once Task 14 exists) —
never a hard failure, but Task 13's wiring should not assume the fetch
succeeds.

## Folder Tree (actual, not planned)
```
├── client/                   (placeholder — Task 15)
│   └── README.md
├── server/
│   ├── config/
│   │   ├── env.js              (+ githubToken, optional — Task 12)
│   │   └── db.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── projectController.js
│   │   └── ingestController.js   (ingestEvent — validates, persists via errorGroupService, 202s — Task 9.3)
│   ├── services/
│   │   ├── authService.js
│   │   ├── projectService.js
│   │   ├── fingerprintService.js
│   │   ├── errorGroupService.js  (recordEvent — atomic upsert dedup + ErrorEvent creation — Task 9.3)
│   │   ├── aiService.js          (buildPrompt/callGemini/parseAndValidate — Task 11)
│   │   └── githubService.js      (fetchCodeSnippet/extractSnippet — Task 12)
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   └── apiKeyMiddleware.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── projectRoutes.js
│   │   └── ingestRoutes.js
│   ├── models/
│   │   ├── Project.js
│   │   ├── ErrorGroup.js
│   │   ├── ErrorEvent.js         (errorGroupId ref, rawStack, env, metadata, receivedAt — Task 9.2)
│   │   └── User.js
│   ├── utils/
│   │   ├── apiKey.js
│   │   ├── generateToken.js
│   │   └── stackNormalizer.js
│   ├── app.js
│   ├── server.js
│   ├── package.json              (+ @google/genai@^2.10.0 — Task 11)
│   ├── package-lock.json
│   ├── .env.example               (+ GITHUB_TOKEN, optional — Task 12)
│   └── .env                       (gitignored, local only — PORT=5050; GEMINI_API_KEY and GITHUB_TOKEN now populated by the user)
├── demo-app/                  (real now, not a placeholder — Task 10)
│   ├── package.json
│   ├── index.js                (3 crash routes, fire-and-forget reporter to /api/events)
│   ├── .env.example             (PORT=4000, FAULTLINE_API_URL, FAULTLINE_API_KEY)
│   └── README.md
├── docs/
│   ├── AI_CONTEXT.md          (Tasks 11–12 marked done; known confidence-type doc gap flagged inline)
│   ├── API.md                 (Ingestion contract updated for Task 9.3 — errorGroupId/isNewGroup in response, 500 path added)
│   ├── ARCHITECTURE.md        (folder tree current through Task 12; also fixed two entries stale since 9.3)
│   ├── CHANGELOG.md           (+ entries for 9.2, 9.3, 10, 11, 12)
│   ├── DATABASE.md            (ErrorEvent moved to Implemented; ErrorGroup's unique index noted as live-exercised)
│   ├── DECISIONS.md           (+ ErrorGroup $setOnInsert entry, + aiService package/model entry, + githubService windowing/token entry)
│   ├── HANDOFF.md             (this file)
│   ├── INTERVIEW_NOTES.md     (+ Q&A for 9.3, 10, 11, 12)
│   ├── PROJECT_CONTEXT.md     (Milestone 2 → COMPLETE 6/6 — confirm the corrected line landed, see flag above; Milestone 3 → 2/4)
│   └── TASKS.md                (Tasks 9, 10, 11, 12 all checked off)
├── .gitignore
└── README.md
```

## Locked-In Decisions Currently In Play
- Dedup uses atomic `findOneAndUpdate` upsert, not read-then-write; first-occurrence detected via `lastErrorObject.upserted` (`includeResultMetadata: true`, Mongoose 8's option name), not a separate existence check.
- `ErrorGroup.message`/`stackSample` set only via `$setOnInsert` (never overwritten by later occurrences); `count`/`lastSeen` update on every occurrence.
- `aiService` uses `@google/genai` (current GA SDK, not the deprecated `@google/generative-ai`) and hardcodes `gemini-2.5-flash` — a bounded summarization task, doesn't need frontier reasoning.
- `parseAndValidate` returns `null` on any malformed/invalid response rather than throwing — callers save `aiSummary: null` and continue, never crash ingestion.
- `githubService.fetchCodeSnippet` returns a windowed snippet (±15 lines around the target line), not the whole file — bounded prompt size/cost, matches AI_CONTEXT.md's Data Minimization principle.
- `githubRepo` is re-validated against `^[\w.-]+\/[\w.-]+$` at the point it's used to build the GitHub API URL, even though `Project.js`'s schema already enforces it — defense in depth, never trust a value at the point it becomes part of an outbound request.
- AppError/catchAsync intentionally not used yet — plain try/catch until Task 20.

## Session-Scoped Preferences From Session 15 (not permanent — restate explicitly if still wanted)
Per PROJECT_RULES.md §20, these applied for this session only and are
**not** amendments to PROJECT_RULES.md itself:
- Flag each subtask's expected effort level (low/medium/high) before starting it.
- Hold all documentation diffs until the user has manually tested and confirmed — never write doc updates speculatively ahead of confirmation.
- Give full git commands (`add`/`commit`/`push`) as one block, not just the commit message.

## Files Created/Modified This Session
**New:** `server/models/ErrorEvent.js`, `server/services/errorGroupService.js`, `server/services/aiService.js`, `server/services/githubService.js`, `demo-app/package.json`, `demo-app/index.js`, `demo-app/.env.example`
**Modified:** `demo-app/README.md` (real content, was placeholder), `server/controllers/ingestController.js`, `server/package.json`, `server/config/env.js`, `server/.env.example`, and the docs listed in the folder tree above.

## Manual Testing This Session
- `ErrorEvent`: `validateSync()` — valid doc clean, both required-field rejections, all defaults correct — passed.
- Task 9.3 dedup wiring: live against running server + Atlas — duplicate event collapsed into one `ErrorGroup` (`count: 2`, 2 linked `ErrorEvent`s); distinct event produced a separate `ErrorGroup` (`count: 1`) — passed.
- Demo app (Task 10): live end-to-end — repeated route → one `ErrorGroup` (`count: 3`); other two routes → one `ErrorGroup` each (`count: 1`); 5 `ErrorEvent`s total, all correctly linked — passed.
- `aiService`: `buildPrompt`/`parseAndValidate` locally (valid input, bad severity, malformed JSON, empty `suggestedFix` all handled); `callGemini` live against a real Gemini API key — passed.
- `githubService`: `extractSnippet` locally (centered window, clamped at file start/end, empty input, invalid line number); `fetchCodeSnippet` live against a real public repo (valid file, missing file → `null`, no repo configured → `null`, malformed `githubRepo` → `null`) — passed.

## Known Bugs
None open in code. One doc-only mistake this session (Milestone 2 progress miscount), corrected — see flag above pending confirmation it landed.

## Deferred / Follow-Up Items Still Active
- AppError/catchAsync refactor — deferred to Task 20.
- Atlas dev-cluster password rotation — pending since Task 2.1, carried across multiple sessions now; still not done.
- `extractErrorType()`'s generic `"Error"` bucket for non-conventional error names — documented limitation, not a bug.
- `AI_CONTEXT.md`'s `confidence` type mismatch (Number vs high/low strings) — see flag above, fix before Task 14.
- `githubService`'s file-path heuristic isn't guaranteed to match a repo's real layout — see flag above, Task 13's wiring must tolerate `fetchCodeSnippet` returning `null`.
- (Resolved this session, removing from future carry-forward: Task 7's response-body spot-check — Task 9.3's manual testing directly verified the response body fields (`errorGroupId`, `isNewGroup`) live, byte-for-byte, so this is no longer an open item.)

## Local Environment Notes
Port 5000 is unusable on this machine (AirPlay Receiver, respawned by `launchd` even after `kill -9`). Local server `.env` sets `PORT=5050`. `.env.example` and `env.js`'s fallback intentionally still say `5000`. Demo app (Task 10) runs separately on `PORT=4000` (its own `.env`, not the server's).

## Git State
No commit or push was independently confirmed by the user this
session — each task ended with a suggested full `git add`/`commit`/
`push` block, but the conversation moved straight to the next task
each time without an explicit "pushed" confirmation. **Assume none of
the below are actually committed until verified with `git log` /
`git status` locally:**
- Suggested: `feat(9.3): wire fingerprintService + atomic upsert dedup into ingestController` (bundled with 9.2's model, per that session's commit message)
- Suggested: `feat(10): add demo Express app, verify dedup end-to-end`
- Suggested: `feat(11): add aiService (buildPrompt/callGemini/parseAndValidate)`
- Suggested: `feat(12): add githubService for GitHub Contents API grounding`

If none of these landed, that's four commits (9.2+9.3 bundled, 10, 11,
12) waiting to be run in order before any further work, to keep
history matching the one-subtask-one-commit convention.

## NEXT_SESSION_PROMPT
Current milestone/task: Milestone 3, Task 13

Objective: Wire `aiService` and `githubService` together into the ingestion "new group" path — fire-and-forget, dispatched after the HTTP response is already sent, never awaited in the request/response cycle (AI_CONTEXT.md's Dispatch Model). Only fires when `errorGroupService.recordEvent()` returns `isNewGroup: true`; never on duplicate occurrences.

Files expected to change:
- `server/services/errorGroupService.js` or `server/controllers/ingestController.js` — wherever the fire-and-forget dispatch is cleanest given the existing layering (controller stays thin; likely a new function, not a controller-level `setImmediate`/no-await call directly)
- Needs: parse the top application frame from the stack (reuse `stackNormalizer.normalizeStack()` — do not re-implement frame parsing), call `githubService.fetchCodeSnippet()` with it, call `aiService.buildPrompt()` → `callGemini()` → `parseAndValidate()`, then persist the result onto the `ErrorGroup` (`aiSummary` field) — but NOT `confidence`/`affectedFile`/`affectedFunction`, those are Task 14

Documentation expected to change:
- `docs/AI_CONTEXT.md` — status update, Dispatch Model section confirmed implemented
- `docs/DECISIONS.md` — wherever the fire-and-forget mechanism itself is implemented (`setImmediate`? bare un-awaited promise? worth being explicit about which and why)
- `docs/TASKS.md` — check off Task 13
- `docs/CHANGELOG.md` — new entry
- `docs/INTERVIEW_NOTES.md` — Q&A for this feature
- `docs/PROJECT_CONTEXT.md` — Task 13 → DONE, Milestone 3 → 3 of 4
- `docs/API.md` — note that `POST /api/events`'s 202 response is unaffected (fire-and-forget means the response shape doesn't change), but enrichment now happens asynchronously afterward

Manual tests to perform:
- Trigger a genuinely new error via the demo app or curl; confirm (via Atlas/mongosh, checked shortly after the 202 response, not immediately) that the corresponding `ErrorGroup` now has a non-null `aiSummary` with `rootCause`/`severity`/`suggestedFix`
- Trigger a duplicate of an existing error; confirm `aiSummary` is untouched (fire-and-forget must not re-run on duplicates)
- Confirm the ingestion HTTP response itself returns quickly (not blocked waiting on the Gemini call) — this is the whole point of fire-and-forget, worth actually timing

Expected git commit: `feat(13): wire AI enrichment into new-group ingestion path, fire-and-forget`

Expected stopping point: enrichment fires exactly once per new group, confirmed via live Atlas check after the fact, ingestion latency unaffected by LLM latency — matches Definition of Done, PROJECT_RULES.md §14. Task 14 (derived `confidence`/`affectedFile`/`affectedFunction`) is explicitly NOT part of this subtask.