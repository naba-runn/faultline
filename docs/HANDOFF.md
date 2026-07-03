# Faultline — Handoff

## Handoff: End of Milestone 1 (Backend Foundation)

Generated per this file's own policy (auto-generated at the end of
each milestone). Milestone 1 — all 4 tasks — is complete and verified.

### Where things stand

Read `PROJECT_CONTEXT.md` first, then `TASKS.md`. Both are current as
of this handoff. Short version: full auth system (register, login,
JWT middleware, protected `/me` route) is working end-to-end against
a live MongoDB Atlas dev cluster. Milestone 2 (Projects & Ingestion)
has not started — Task 5 is next.

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
│   │   └── authController.js
│   ├── services/
│   │   └── authService.js
│   ├── middleware/
│   │   └── authMiddleware.js
│   ├── routes/
│   │   └── authRoutes.js
│   ├── models/
│   │   └── User.js
│   ├── utils/
│   │   └── generateToken.js
│   ├── app.js
│   ├── server.js
│   ├── package.json
│   ├── package-lock.json
│   ├── .env.example
│   └── .env               (gitignored, local only)
├── demo-app/                  (placeholder — Task 10)
│   └── README.md
├── docs/
│   ├── AI_CONTEXT.md
│   ├── API.md
│   ├── ARCHITECTURE.md
│   ├── CHANGELOG.md
│   ├── DATABASE.md
│   ├── DECISIONS.md
│   ├── HANDOFF.md
│   ├── INTERVIEW_NOTES.md    (still empty — see Pending below)
│   ├── PROJECT_CONTEXT.md
│   └── TASKS.md
├── .gitignore
└── README.md
```

### Files created this milestone

`server/config/env.js`, `server/config/db.js`, `server/app.js`,
`server/server.js`, `server/models/User.js`,
`server/utils/generateToken.js`, `server/services/authService.js`,
`server/controllers/authController.js`, `server/routes/authRoutes.js`,
`server/middleware/authMiddleware.js`, `server/package.json`,
`server/.env.example`, `client/README.md`, `demo-app/README.md`.

### Files remaining (per TASKS.md, Milestones 2–5)

`server/models/Project.js`, `server/models/ErrorGroup.js`,
`server/models/ErrorEvent.js`, `server/services/fingerprintService.js`,
`server/services/aiService.js`, `server/middleware/apiKeyMiddleware.js`,
full `client/` React app, `demo-app/` Express app. Full list in
`TASKS.md`.

### Current known bugs

None open. All manual tests across Tasks 1–4 passed as documented in
`CHANGELOG.md`.

### Pending improvements / deferred items

- `AppError`/`catchAsync` refactor — deliberately deferred to Task 20,
  not a bug, just not yet done. Controllers currently use plain
  try/catch (see `DECISIONS.md` note on why this is fine for now).
- `docs/INTERVIEW_NOTES.md` is still empty. Per doc policy this should
  get an entry per completed feature — none has been written yet
  despite two features (auth, JWT middleware) being done. Worth
  catching up on next session (see prompt below).
- The Atlas dev-cluster database user's password (`Nabarundey2704`)
  was posted in plaintext in chat during Task 2.1 debugging. Low risk
  for a dev-only demo DB, but rotating it in Atlas (Database Access →
  Edit → new password, then update local `.env`) is a good habit
  before this project holds anything real.

### Git state

Last commit (per this session): `docs: close out Task 4 and Milestone
1 (Backend Foundation)`. Next commit will be the start of Task 5
(Project model + CRUD + API key generation/hashing) — no commit made
for Task 5 yet, it hasn't started.

### Ready-to-paste prompt for a new Claude session

```
The uploaded project ZIP reflects the latest state of the codebase.
Treat the files in the ZIP as the canonical implementation and the
documentation as the project's canonical memory. If there is a
conflict, explain it before making changes.

Read docs/PROJECT_CONTEXT.md first, then docs/TASKS.md, then the
most recent entries in docs/CHANGELOG.md. Milestone 1 (Backend
Foundation) is complete and verified end-to-end. Continue from
Task 5 — Project model + CRUD + API key generation/hashing — the
first task of Milestone 2 (Projects & Ingestion).

Break Task 5 into subtasks (~15–30 min each), stop after each one for
manual testing, a Definition of Done checklist (code written / manual
test passed / documentation updated / git commit created / git
pushed / ready for next subtask), and my confirmation before
continuing. Provide file contents directly rather than via shell
redirection. Update only the documentation that changed after each
subtask, and maintain docs/DECISIONS.md and docs/INTERVIEW_NOTES.md
as described in docs/TASKS.md's Notes section.
```