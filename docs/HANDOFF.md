# Faultline — Handoff
Session: 14 — 4 July 2026
<!-- Regenerated in full at each session boundary. This file plus
PROJECT_RULES.md should be sufficient to resume work without opening
any other doc. Policy: PROJECT_RULES.md §3, §10–§13. -->

## Where Things Stand
Milestone: 2 — Projects & Ingestion (4 of 6 tasks fully closed)
Task: 9 — ErrorGroup/ErrorEvent models + atomic upsert dedup (in progress)
Subtask: 9.1 complete (ErrorGroup model). 9.2 (ErrorEvent model) next, not started. 9.3 (wire dedup into ingestController) after that.

Task 8 (stack normalizer + fingerprint service) is fully closed — both
8.1 and 8.2 done and verified. A real bug was caught and fixed during
8.1 verification: path anchoring used the first matching root-marker
segment instead of the last, breaking cross-environment fingerprint
stability when the deploy root was itself a marker word (e.g. Docker's
`/app/server/...`). Fixed and re-verified.

9.1 (`ErrorGroup.js`) is schema-complete with the `{projectId,
fingerprint}` compound unique index, verified via `validateSync()`
(valid doc clean, required-field rejection, bad-enum rejection, all
defaults correct). **Not yet exercised against live Atlas** — no live
insert or real duplicate-key test has been run on this model. That
happens naturally as part of 9.3's manual testing, not as a separate
step.

⚠ **Unverified status flag:** the Task 8.2 diff to `PROJECT_CONTEXT.md`
was given in chat but not re-confirmed as applied before this handoff
was written. **Double-check `PROJECT_CONTEXT.md` actually shows Task 8
as fully DONE** before trusting it in a future session.

confirm-line + this-session-delta only

## Folder Tree (actual, not planned)(conditional)

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

## Locked-In Decisions Currently In Play
- Dedup uses atomic `findOneAndUpdate` upsert, not read-then-write; first-occurrence detected via `upsertedId`, not a separate existence check.
- `firstSeen`/`lastSeen` used deliberately instead of Mongoose's built-in `timestamps` (see DECISIONS.md).
- Fingerprint = `hash(errorType + normalizedStackSignature)`, with a stackless fallback to type + raw message.
- AppError/catchAsync intentionally not used yet — plain try/catch until Task 20.

## Files Created/Modified This Session
**New:** `server/services/fingerprintService.js`, `server/models/ErrorGroup.js`
**Modified:** `docs/DECISIONS.md`, `docs/INTERVIEW_NOTES.md`, `docs/CHANGELOG.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/TASKS.md` (Task 8 checked off), `docs/PROJECT_CONTEXT.md` (Task 8 → DONE, Task 9.1 → DONE — *see unverified status flag above*)

## Manual Testing This Session
- `fingerprintService`: cross-environment equality, type-mismatch produces different fingerprint, stackless fallback — passed.
- `ErrorGroup` model: `validateSync()` — valid doc clean, required-field rejection, bad-enum rejection, all defaults correct — passed. Live Atlas insert/duplicate-key test **not yet run**.

## Known Bugs
None open.

## Deferred / Follow-Up Items Still Active
- AppError/catchAsync refactor — deferred to Task 20.
- Atlas dev-cluster password rotation — pending since Task 2.1, multiple sessions now.
- Task 7's response *bodies* were never re-confirmed byte-for-byte (status codes only) — worth a spot-check once Task 9.3 changes what this endpoint does.
- `ErrorGroup`'s unique compound index not yet exercised against live Atlas with a real duplicate-key attempt — do as part of 9.3's manual testing.
- `extractErrorType()`'s generic `"Error"` bucket for non-conventional error names — documented limitation, not a bug.

## Local Environment Notes
Port 5000 is unusable on this machine (AirPlay Receiver, respawned by `launchd` even after `kill -9`). Local `.env` sets `PORT=5050`. `.env.example` and `env.js`'s fallback intentionally still say `5000`.

## Git State
- Commit created: Task 8.2 + HANDOFF-recovery bundle — user-confirmed committed and pushed, not independently verified via `git log`.
- **Task 9.1 is NOT yet committed** — suggested commit below, waiting to be run.
- Suggested commit: `feat(9.1): add ErrorGroup model with compound unique index`

## NEXT_SESSION_PROMPT
Current milestone/task/subtask: Milestone 2, Task 9, subtask 9.2

Objective: Implement the `ErrorEvent` model per `DATABASE.md`'s locked-in schema — the per-occurrence record that `ErrorGroup` aggregates.

Files expected to change:
- `server/models/ErrorEvent.js` — new

Documentation expected to change:
- `docs/DATABASE.md` — move ErrorEvent from Planned to Implemented
- `docs/TASKS.md` — check off 9.2
- `docs/CHANGELOG.md` — new entry
- `docs/INTERVIEW_NOTES.md` — Q&A for this feature
- `docs/PROJECT_CONTEXT.md` — 9.2 → DONE

Manual tests to perform:
- `validateSync()`: valid doc clean, required-field rejection, any enum/type rejections the schema defines

Expected git commit: `feat(9.2): add ErrorEvent model`

Expected stopping point: model implemented and verified in isolation, not yet wired to any controller (that's 9.3) — matches Definition of Done, PROJECT_RULES.md §14.