# Faultline — Handoff

## Handoff: End of Milestone 2, Task 7 (subtask 7.1 complete) — Tasks 5 and 6 also fully closed

Generated at a subtask boundary, and also closing a documentation gap:
the previous session ran out of budget after committing Task 7.1's
code and *some* docs (API.md, DATABASE.md, DECISIONS.md,
INTERVIEW_NOTES.md, PROJECT_CONTEXT.md, TASKS.md), but never updated
CHANGELOG.md, ARCHITECTURE.md, or this file. That gap is now closed —
implementation was already correct and complete; only documentation
was recovered this pass.

### Where things stand

Read `PROJECT_CONTEXT.md` first — it's accurate and current. Milestone
1 (full auth system) is complete and verified end-to-end. Milestone 2
is 3 of 6 tasks in:

- **Task 5** (Project model + CRUD + API key generation/hashing) —
  complete, subtasks 5.1–5.5, full lifecycle verified against live
  Atlas
- **Task 6** (apiKeyMiddleware) — complete, subtask 6.1, all 5 manual
  test cases passed
- **Task 7** (ingestion endpoint skeleton) — complete, subtask 7.1,
  `POST /api/events` validates and returns `202`, no persistence yet

**Not done yet:** Task 8 (stack normalizer + fingerprint service)
onward.

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
│   │   └── ingestController.js   (ingestEvent — validates + 202s, no persistence)
│   ├── services/
│   │   ├── authService.js
│   │   └── projectService.js
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   └── apiKeyMiddleware.js   (hash lookup + timingSafeEqual, attaches req.project)
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── projectRoutes.js
│   │   └── ingestRoutes.js       (POST / — apiKeyMiddleware-guarded, mounted at /api/events)
│   ├── models/
│   │   ├── Project.js
│   │   └── User.js
│   ├── utils/
│   │   ├── apiKey.js
│   │   └── generateToken.js
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
│   ├── API.md                 (Ingestion section fully documented)
│   ├── ARCHITECTURE.md        (folder tree + request flow brought current this pass)
│   ├── CHANGELOG.md           (backfilled 5.5/6.1/7.1 entries this pass)
│   ├── DATABASE.md            (+ Task 7 note under Planned Collections)
│   ├── DECISIONS.md           (+ API key hashing, + enumeration-avoidance, + ingestion-skeleton entries)
│   ├── HANDOFF.md             (this file)
│   ├── INTERVIEW_NOTES.md     (+ Task 6, + Task 7 Q&A)
│   ├── PROJECT_CONTEXT.md     (accurate — Task 6/7 marked DONE, Task 8 NEXT)
│   └── TASKS.md                (Tasks 5, 6, 7 checked off)
├── .gitignore
└── README.md
```

### Files created/modified since the last handoff

**New (Task 6 + 7, previous session):**
`server/middleware/apiKeyMiddleware.js`,
`server/controllers/ingestController.js`,
`server/routes/ingestRoutes.js`

**Modified (Task 6 + 7, previous session):** `server/app.js` (mounted
`ingestRoutes` at `/api/events`, removed the Task 6.1 temp test
route), `docs/TASKS.md`, `docs/DECISIONS.md`, `docs/INTERVIEW_NOTES.md`,
`docs/API.md`, `docs/DATABASE.md`, `docs/PROJECT_CONTEXT.md`

**Modified (this session — documentation recovery only, no code
changes):** `docs/CHANGELOG.md` (backfilled missing 5.5/6.1/7.1
entries), `docs/ARCHITECTURE.md` (folder tree + request flow synced to
current code), `docs/HANDOFF.md` (this rewrite)

### Local environment note

Port 5000 is unusable on this machine — a respawning local process
(AirPlay Receiver, relaunched by `launchd` even after `kill -9`)
occupies it. Local `.env` sets `PORT=5050` to work around this.
`.env.example` and `env.js`'s fallback still correctly say `5000` as
the project's real default; unchanged since last handoff.

### Files remaining (per TASKS.md, Milestones 2–5)

`server/services/fingerprintService.js` (Task 8),
`server/models/ErrorGroup.js`, `server/models/ErrorEvent.js` (Task 9),
`demo-app/` Express app (Task 10), then Milestone 3's `aiService.js`
and GitHub-fetch pieces, then the full `client/` React app in
Milestones 4–5. Full list in `TASKS.md`.

### Current known bugs

None open.

### Pending improvements / deferred items

- `AppError`/`catchAsync` refactor — still deliberately deferred to
  Task 20, per `DECISIONS.md`/`ARCHITECTURE.md`. Not a bug.
- The Atlas dev-cluster database user's password was posted in
  plaintext in chat during Task 2.1 debugging and still has not been
  rotated. Pending across multiple sessions now — worth actually doing
  (Atlas → Database Access → Edit → new password → update local
  `.env`).
- Task 7's manual verification confirmed status codes for all cases
  but didn't individually re-confirm response *bodies* byte-for-byte —
  worth a quick spot-check before Task 8 builds persistence on top of
  this endpoint.

### Git state

Last commits: `4e03a07 task 7.1 completed`, `bde4cf6 feat(middleware):
add apiKeyMiddleware (Task 6.1)`, `0008596 test(projects): verify full
CRUD lifecycle, close out Task 5`. All pushed — working tree clean,
branch up to date with `origin/main`.

This session's work (the CHANGELOG.md/ARCHITECTURE.md/HANDOFF.md
documentation recovery above) is **not yet committed** — staged for a
suggested commit, pending your confirmation, no production code
changes involved.

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
   any "DONE" status.

Milestone 1 (Backend Foundation) is complete. Milestone 2: Tasks 5, 6,
and 7 are complete and verified — Project CRUD + API keys,
apiKeyMiddleware, and the ingestion endpoint skeleton. Task 8 (stack
normalizer + fingerprint service) is next, not yet started.

Continue into Task 8 per docs/TASKS.md. Do not redesign the project.
Do not recreate files that already exist.

From now on:
- Break every implementation task into subtasks (~15-30 min each).
  Stop after each one for manual testing, a Definition of Done
  checklist, and my confirmation before continuing.
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