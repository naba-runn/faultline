# Faultline — Handoff

# Permanent Project Workflow (Version 2)

These rules apply to every future Claude session unless I explicitly override them.

They supersede earlier workflow instructions.

---

# Primary Objective

The objective is no longer only to build Faultline.

The objective is to maximize engineering quality while minimizing token usage across long-running Claude sessions.

Assume this project will span many Claude conversations.

Optimize for smooth continuation between sessions.

---

# General Rules

* Never redesign the approved architecture.
* Never recreate completed work.
* Never repeat completed implementation.
* Never silently overwrite existing code.
* Never continue automatically.
* Complete exactly one implementation subtask at a time.
* Wait for my confirmation before starting another implementation subtask.

---

# Documentation Policy

Documentation is maintained continuously.

However:

Only update documentation whose contents actually changed.

Never modify documentation merely for consistency.

Typical mapping:

PROJECT_CONTEXT.md

* Update when milestone, task or current project state changes.

TASKS.md

* Update when a task or subtask is completed.

CHANGELOG.md

* Update after every completed implementation subtask.

API.md

* Update only when API changes.

DATABASE.md

* Update only when schemas or relationships change.

ARCHITECTURE.md

* Update only when architecture or request flow changes.

AI_CONTEXT.md

* Update only when AI-related design changes.

DECISIONS.md

* Update whenever a non-trivial engineering decision is made.

INTERVIEW_NOTES.md

* Update whenever a meaningful feature is completed.

README.md

* Update only when setup or user-facing functionality changes.

HANDOFF.md

* Do NOT rewrite after every subtask.
* Generate only:

  * when I explicitly type HANDOFF
  * before switching Claude accounts
  * before ending a work session
  * when remaining token budget becomes low

---

# Token-Aware Workflow

Claude should continuously consider remaining context budget.

If sufficient context remains:

continue the normal workflow.

If context is becoming low:

do NOT attempt another implementation task.

Instead:

prepare the project for continuation.

---

# Low-Token Recovery Mode

If remaining context appears too low to safely complete both:

* implementation
  and
* documentation

switch into Recovery Mode.

Recovery Mode exists to prevent expensive re-analysis by the next Claude session.

In Recovery Mode:

1. Finish the current code changes if safely possible.

2. Do NOT start any new implementation.

3. Record exactly what remains unfinished.

4. Record every documentation file that still requires updates.

5. Record which documentation sections require updating.

6. Record whether implementation is already complete.

7. Record whether manual testing is complete.

8. Record whether git commit has been created.

9. Record whether git push has been completed.

10. Record anything the next Claude must finish before writing more code.

Never leave the next Claude guessing.

---

# Pending Recovery Section

Whenever Recovery Mode is triggered,

HANDOFF.md must contain a section named:

## PENDING_RECOVERY

It should explicitly state:

* implementation finished?
* documentation pending?
* which documentation files remain
* git status
* testing status
* next mandatory action

Example:

Implementation:
Completed

Manual Testing:
Completed

Documentation Pending:

* PROJECT_CONTEXT.md
* CHANGELOG.md
* TASKS.md

Git:
Not committed

Next Required Action:
Update the three documentation files above.
Create commit.
Push.
Only then continue implementation.

This section should eliminate the need for repository-wide investigation.

---

# Next Session Prompt

Every HANDOFF.md must end with:

## NEXT_SESSION_PROMPT

Unlike previous versions,

this prompt should NOT be generic.

It should assume the current Claude has maximum context.

Generate a ready-to-paste prompt specifically for the next unfinished subtask.

The prompt should include:

* current milestone
* current task
* current subtask
* exact implementation objective
* expected files to modify
* expected documentation files
* manual tests to perform
* expected git commit
* expected stopping point

The next Claude should be able to begin implementation immediately without spending tokens planning the next step.

---

# Planning Policy

Planning should happen in the current session,

not the next one.

The current Claude always has maximum context.

Use that advantage.

The next Claude should implement,

not rediscover.

---

# Definition of Done

A subtask is complete only if:

✓ Code implemented

✓ Manual testing completed

✓ Required documentation updated

✓ Suggested git commit generated

✓ Ready for the next subtask

If Recovery Mode was entered,

replace documentation updates with PENDING_RECOVERY.

---

# Teaching

Continue briefly explaining engineering decisions while implementing.

Keep explanations concise.

Implementation remains the priority.

---

# Code Quality

Continue following:

* modular architecture
* separation of concerns
* reusable code
* centralized error handling
* security best practices
* maintainability
* scalability

Never sacrifice architecture for speed.

---

# Code Reviews

Whenever I request a review,

review the implementation like a Google Staff Software Engineer.

Focus on:

* correctness
* architecture
* security
* scalability
* readability
* maintainability

Do not ignore weaknesses.

Be technically honest.


## Handoff: Milestone 2, Task 9 (subtask 9.1 complete) — Task 8 fully closed

Generated at a subtask boundary. Task 8 (stack normalizer +
fingerprint service) is now fully closed — both 8.1 and 8.2 done and
verified. Task 9 (ErrorGroup/ErrorEvent models + atomic upsert dedup)
is now in progress, subtask 9.1 complete.

### Where things stand

Read `PROJECT_CONTEXT.md` first. Milestone 1 (full auth system) is
complete and verified end-to-end. Milestone 2 is 4 of 6 tasks fully
closed, a 5th in progress:

- **Task 5** (Project model + CRUD + API key generation/hashing) —
  complete, subtasks 5.1–5.5
- **Task 6** (apiKeyMiddleware) — complete, subtask 6.1
- **Task 7** (ingestion endpoint skeleton) — complete, subtask 7.1
- **Task 8** (stack normalizer + fingerprint service) — **complete**:
  - 8.1 — `server/utils/stackNormalizer.js` (`parseStackFrames`,
    `normalizeStack`, `normalizeFilePath`). A real bug was caught and
    fixed during manual verification: path anchoring used the first
    matching root-marker segment instead of the last, which broke
    cross-environment fingerprint stability whenever the deploy root
    itself was also a marker word (e.g. Docker's `/app/server/...`).
    Fixed and re-verified.
  - 8.2 — `server/services/fingerprintService.js`
    (`generateFingerprint`, `extractErrorType`). Combines the parsed
    error type with `stackNormalizer`'s signature, SHA-256 hashed.
    Falls back to type + raw message when the signature is empty
    (stackless errors), so those don't all collapse into one bucket.
- **Task 9** (ErrorGroup/ErrorEvent models + atomic upsert dedup) —
  **in progress**:
  - 9.1 — `server/models/ErrorGroup.js` complete. Schema:
    `projectId`, `fingerprint`, `message`, `stackSample`, `status`
    (enum `open`/`resolved`/`ignored`, default `open`),
    `statusHistory[]` (append-only), `aiSummary` (nested, nullable —
    `rootCause`/`severity`/`suggestedFix[]`/`confidence`/
    `affectedFile`/`affectedFunction`), `count` (default 1),
    `firstSeen`/`lastSeen` (both default `Date.now`, deliberately used
    instead of Mongoose's built-in `timestamps` — see `DECISIONS.md`).
    Compound unique index on `{ projectId, fingerprint }` declared —
    this is the DB-level guarantee Task 9.3's atomic upsert will rely
    on. Manually verified via `validateSync()`: valid doc clean,
    required-field rejection, bad-enum rejection, all defaults
    correct. **Not yet exercised against live Atlas** — no live insert
    test has been run on this model yet, and the unique index hasn't
    actually been triggered with a real duplicate-key scenario. That
    happens naturally once 9.3 wires this into a live upsert path.

**Not done yet:** 9.2 (`ErrorEvent` model) and 9.3 (wire
`fingerprintService` + the atomic `findOneAndUpdate(..., {upsert:
true})` dedup logic into `ingestController`, replacing the current
202-and-discard behavior). Then Task 10.

### Folder tree (actual, not planned)

```
faultline/
├── client/                   (placeholder — Task 15)
│   └── README.md
├── server/
│   ├── config/
│   │   ├── env.js
│   │   └── db.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── projectController.js
│   │   └── ingestController.js   (ingestEvent — validates + 202s, STILL no persistence — 9.3 changes this)
│   ├── services/
│   │   ├── authService.js
│   │   ├── projectService.js
│   │   └── fingerprintService.js (generateFingerprint, extractErrorType — pure, not yet called from any controller)
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   └── apiKeyMiddleware.js   (hash lookup + timingSafeEqual, attaches req.project)
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── projectRoutes.js
│   │   └── ingestRoutes.js       (POST / — apiKeyMiddleware-guarded, mounted at /api/events)
│   ├── models/
│   │   ├── Project.js
│   │   ├── ErrorGroup.js         (projectId + fingerprint compound-unique index — dedup backbone; not yet wired to any controller)
│   │   └── User.js
│   ├── utils/
│   │   ├── apiKey.js
│   │   ├── generateToken.js
│   │   └── stackNormalizer.js    (parseStackFrames, normalizeStack, normalizeFilePath — used by fingerprintService)
│   ├── app.js                    (mounts /api/auth, /api/projects, /api/events)
│   ├── server.js
│   ├── package.json
│   ├── package-lock.json
│   ├── .env.example
│   └── .env                      (gitignored, local only — PORT=5050, see below)
├── demo-app/                  (placeholder — Task 10)
│   └── README.md
├── docs/
│   ├── AI_CONTEXT.md          (unchanged — not yet implemented, starts at Task 11)
│   ├── API.md                 (unchanged — Ingestion contract still describes the 202-skeleton behavior; will need a Task 9.3 update once persistence lands)
│   ├── ARCHITECTURE.md        (folder tree updated for fingerprintService.js + ErrorGroup.js)
│   ├── CHANGELOG.md           (+ Task 8.2, + Task 9.1 entries)
│   ├── DATABASE.md            (ErrorGroup: real schema code now in "Implemented Collections"; ErrorEvent still "Planned")
│   ├── DECISIONS.md           (+ fingerprint composition entry, + firstSeen/lastSeen-vs-timestamps entry)
│   ├── HANDOFF.md             (this file)
│   ├── INTERVIEW_NOTES.md     (+ Task 8.2 Q&A, + Task 9.1 Q&A)
│   ├── PROJECT_CONTEXT.md     (Task 8 marked DONE in full; Task 9 IN PROGRESS, 9.1 DONE — confirm this is actually committed, see note below)
│   └── TASKS.md                (Task 8 checked off; Task 9 correctly still open)
├── .gitignore
└── README.md
```

### Files created/modified since the last handoff

**New (Task 8.2 + 9.1):** `server/services/fingerprintService.js`,
`server/models/ErrorGroup.js`

**Modified (Task 8.2 + 9.1):** `docs/DECISIONS.md`,
`docs/INTERVIEW_NOTES.md`, `docs/CHANGELOG.md`, `docs/ARCHITECTURE.md`,
`docs/DATABASE.md`, `docs/TASKS.md` (Task 8 checked off),
`docs/PROJECT_CONTEXT.md` (Task 8 → DONE, Task 9.1 → DONE)

**⚠ Note on PROJECT_CONTEXT.md:** the Task 8.2 status-line diff was
given to you in chat but I did not re-verify you applied it before
this handoff was generated (you moved straight to Task 9 without a
"confirmed" checkpoint on that one, understandably, given the token
concern). **Double-check `docs/PROJECT_CONTEXT.md` actually shows
Task 8 as fully DONE (not still showing 8.2 as NEXT) before trusting
it in a future session** — if it wasn't applied, that file is stale
the same way `HANDOFF.md` was two handoffs ago.

### Local environment note

Port 5000 is unusable on this machine — a respawning local process
(AirPlay Receiver, relaunched by `launchd` even after `kill -9`)
occupies it. Local `.env` sets `PORT=5050` to work around this.
`.env.example` and `env.js`'s fallback still correctly say `5000`.

### Files remaining (per TASKS.md, Milestones 2–5)

`server/models/ErrorEvent.js` (Task 9.2), atomic upsert dedup logic
wired into `ingestController` (Task 9.3), `demo-app/` Express app
(Task 10), then Milestone 3's `aiService.js` and GitHub-fetch pieces,
then the full `client/` React app in Milestones 4–5. Full list in
`TASKS.md`.

### Current known bugs

None open.

### Pending improvements / deferred items

- `AppError`/`catchAsync` refactor — deferred to Task 20.
- Atlas dev-cluster password rotation — still pending since Task 2.1,
  multiple sessions now.
- Task 7's response *bodies* were never re-confirmed byte-for-byte
  (status codes only) — worth a spot-check now that Task 9.3 is about
  to change what this endpoint actually does.
- `ErrorGroup`'s unique compound index has not yet been exercised
  against live Atlas with a real duplicate-key attempt — do that as
  part of 9.3's manual testing, not as a separate step.
- `extractErrorType()`'s known limitation (non-conventional error
  names fall into a generic `"Error"` bucket) — documented, not a bug.

### Git state

As of my last message, you confirmed you committed and pushed the
bundled Task 8.2 + HANDOFF.md-recovery commit. I have not seen that
commit hash or its `git log` output directly — this handoff trusts
your confirmation. **Task 9.1 (this subtask) is NOT yet committed** —
the suggested commit is above, waiting on you to run it.

### Ready-to-paste prompt for a new Claude session

```
The uploaded project ZIP reflects the latest state of the codebase.
Treat the files in the ZIP as the canonical implementation and the
documentation as the project's canonical memory.

Before writing any code:
1. Read the architecture blueprint completely.
2. Read every file inside docs/.
3. Review the current repository structure and existing code.
4. Cross-check docs against actual code/git history before trusting
   any "DONE" status — pay particular attention to whether
   PROJECT_CONTEXT.md's Task 8 status line was actually updated to
   DONE, since that update was given but not re-confirmed as applied.

Milestone 1 complete. Milestone 2: Tasks 5, 6, 7, 8 complete and
verified. Task 9 (ErrorGroup/ErrorEvent models + atomic upsert dedup)
is in progress — 9.1 (ErrorGroup model) done. 9.2 (ErrorEvent model)
is next, not yet started. 9.3 (wiring fingerprintService + the atomic
upsert into ingestController) comes after that.

Continue into Task 9.2 per docs/TASKS.md and docs/DATABASE.md's
locked-in ErrorEvent schema. Do not redesign the project. Do not
recreate files that already exist.

From now on:
- Break every implementation task into subtasks (~15-30 min each).
  Stop after each one for manual testing, a Definition of Done
  checklist, and my confirmation before continuing — unless I
  explicitly ask you to proceed without waiting (e.g. for token
  budget reasons), in which case say so plainly in the handoff, as
  this one does.
- Do NOT execute shell commands on my behalf. Provide commands in
  fenced code blocks for me to run locally.
- Provide file contents directly in the response, not via shell
  heredoc/redirection.
- Before proposing a fix for a reported bug, ask me to paste the
  actual current file content rather than guessing from the symptom
  alone.
- After every completed subtask, update only the documentation that
  changed, and show only the modified sections — except HANDOFF.md,
  which gets fully rewritten at each boundary by design.
- Maintain DECISIONS.md and INTERVIEW_NOTES.md for every non-trivial
  choice and completed feature respectively.
```

## Standing Project Rules

These rules apply to every future Claude session unless explicitly overridden.

- One subtask at a time.
- Stop after each subtask.
- Manual testing required.
- Update only affected documentation.
- Never redesign architecture.
- Never recreate completed work.
- Wait for user confirmation.
- Maintain DECISIONS.md and INTERVIEW_NOTES.md.
- Use HANDOFF.md as the current project state.

After every completed subtask, update every documentation file whose contents changed as a result of that subtask. Do not modify documentation that is unaffected. Before ending a session or switching Claude accounts, generate a complete HANDOFF.md summarizing the current project state.