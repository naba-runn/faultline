# Faultline — Handoff

## Handoff: Mid–Milestone 2, Task 5 (subtasks 5.1–5.4 done, 5.5 remaining)

Generated at a session boundary (token limit on the prior Claude
session), not a milestone boundary — Milestone 2 is not complete, only
partway through its first task.

### Where things stand

Read `PROJECT_CONTEXT.md` first, then `TASKS.md`, then the most recent
entries in `CHANGELOG.md`. Short version: Milestone 1 (full auth
system) is complete and verified end-to-end. Milestone 2 has started —
Task 5 (Project model + CRUD + API key generation/hashing) is done
through subtask 5.4:

- `Project` Mongoose model
- API key generation + SHA-256 hashing utility
- Full CRUD on `/api/projects` — create, list, get-one, update,
  delete — all JWT-protected, all ownership-scoped in the query
  itself, all manually tested against a live MongoDB Atlas dev
  cluster, all committed and pushed

**Not done yet:** subtask 5.5 (full CRUD lifecycle test in one
sequence + final doc pass to formally close out Task 5), and
everything from Task 6 onward.

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
│   │   └── projectController.js  (createProject, listProjects, getProject, updateProject, deleteProject)
│   ├── services/
│   │   ├── authService.js
│   │   └── projectService.js     (create/list/get/update/delete — ownership-scoped in the query itself)
│   ├── middleware/
│   │   └── authMiddleware.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   └── projectRoutes.js      (POST /, GET /, GET/PATCH/DELETE /:id — all authMiddleware-guarded)
│   ├── models/
│   │   ├── Project.js            (ownerId ref User, name, apiKeyHash, githubRepo validated, timestamps incl. updatedAt)
│   │   └── User.js
│   ├── utils/
│   │   ├── apiKey.js             (generateApiKey, hashApiKey — SHA-256, not bcrypt)
│   │   └── generateToken.js
│   ├── app.js                    (now also mounts /api/projects)
│   ├── server.js
│   ├── package.json
│   ├── package-lock.json
│   ├── .env.example
│   └── .env                      (gitignored, local only)
├── demo-app/                  (placeholder — Task 10)
│   └── README.md
├── docs/
│   ├── AI_CONTEXT.md
│   ├── API.md                 (Projects section fully documented: POST/GET list, GET/PATCH/DELETE :id)
│   ├── ARCHITECTURE.md
│   ├── CHANGELOG.md
│   ├── DATABASE.md            (Project schema documented alongside User)
│   ├── DECISIONS.md           (+ API key hashing choice, + 404-not-403 enumeration decision)
│   ├── HANDOFF.md             (this file)
│   ├── INTERVIEW_NOTES.md     (+ Task 5.3, + Task 5.4 entries)
│   ├── PROJECT_CONTEXT.md
│   └── TASKS.md
├── .gitignore
└── README.md
```

### Files created/modified since the Milestone 1 handoff

**New:** `server/models/Project.js`, `server/utils/apiKey.js`,
`server/services/projectService.js`,
`server/controllers/projectController.js`,
`server/routes/projectRoutes.js`.

**Modified:** `server/app.js` (mounts `/api/projects`); every doc file
except `AI_CONTEXT.md` (still correctly untouched — Task 11+ only).

### Files remaining (per TASKS.md, Milestones 2–5)

`server/middleware/apiKeyMiddleware.js`,
`server/services/fingerprintService.js`,
`server/models/ErrorGroup.js`, `server/models/ErrorEvent.js`,
`server/services/aiService.js`, full `client/` React app, `demo-app/`
Express app. Full list in `TASKS.md`.

### Current known bugs

None open. Two bugs were found and fixed *during this session's own
manual verification*, before either was committed — worth knowing
about since they're recorded in `CHANGELOG.md`'s Task 5.4 entry as
examples of exactly the drift/corruption class this project has hit
before:

1. A duplicate `module.exports` accidentally pasted at the end of
   `projectService.js` silently overwrote the real one — no syntax
   error, but `getProject`/`updateProject`/`deleteProject` were
   missing from what the module exported. Caught by testing every
   endpoint immediately.
2. A duplicated `## Not Yet Implemented` section in `API.md` (three
   endpoint lines appeared twice) — caught by asking before
   committing, not after.

Both are resolved in the current committed state. The takeaway that's
now baked into this file's continuation prompt below: **paste the
actual current file content when reporting a bug, and sanity-check
generated doc sections before committing** — both bugs were caught
that way, not by guessing from symptoms.

### Pending improvements / deferred items

- `AppError`/`catchAsync` refactor — still deliberately deferred to
  Task 20, per `DECISIONS.md`/`ARCHITECTURE.md`. Not a bug.
- The Atlas dev-cluster database user's password was posted in
  plaintext in chat during Task 2.1 debugging (see the Milestone 1
  handoff for detail) and still has not been rotated as of this
  session. Still low risk for a dev-only demo DB, but this has now
  been pending across two sessions — worth actually doing before it's
  forgotten a third time (Atlas → Database Access → Edit → new
  password → update local `.env`).
- `apiKeyMiddleware` (Task 6) must compare the incoming key's hash
  against the stored hash using `crypto.timingSafeEqual`, not `===` —
  flagged in `DECISIONS.md`'s API-key-hashing entry so it isn't missed
  when that file is written.
- Subtask 5.5 itself: a full create → get → update → delete lifecycle
  test in one continuous sequence (subtasks 5.1–5.4 were each tested
  individually; 5.5 is the integration pass), plus a final doc
  read-through to confirm nothing else drifted before Task 5 is
  formally checked off in `TASKS.md`.

### Git state

Last commit (per this session): `feat(projects): add get/update/delete
with ownership scoping (Task 5.4)` — includes the corrected `API.md`
(duplicate section removed before commit). Pushed. Next commit will be
Task 5.5's doc-closeout commit, followed by Task 6
(`apiKeyMiddleware`) — no commit made for either yet.

### Ready-to-paste prompt for a new Claude session

```
The uploaded project ZIP reflects the latest state of the codebase.
Treat the files in the ZIP as the canonical implementation and the
documentation as the project's canonical memory. If there is a
conflict, explain it before making changes.

Before writing any code:
1. Read the architecture blueprint completely.
2. Read every file inside docs/, including PROJECT_CONTEXT.md,
   TASKS.md, CHANGELOG.md, API.md, DATABASE.md, ARCHITECTURE.md,
   AI_CONTEXT.md, HANDOFF.md, DECISIONS.md, INTERVIEW_NOTES.md.
3. Review the current repository structure and existing code.
4. Cross-check docs against actual code/git history before trusting
   any "DONE" status — prior sessions have found and fixed real drift
   between docs and code more than once, including a live
   contradiction inside HANDOFF.md itself and two doc/code corruption
   bugs (a silently-overwritten module.exports, a duplicated markdown
   section) caught only because they were tested/read before being
   committed, not after. Don't assume "docs say X" means X is true —
   verify, including by actually running code where you can.

Milestone 1 (Backend Foundation) is complete and verified end-to-end.
Milestone 2, Task 5 (Project model + CRUD + API key generation/
hashing) is done through subtask 5.4 — model, API key gen/hash
utility, and full CRUD (create/list/get/update/delete) all
implemented, manually tested against a live MongoDB Atlas dev cluster,
committed, and pushed. Full detail in docs/HANDOFF.md's latest entry.

Continue from Task 5.5 — a full create/get/update/delete lifecycle
test in one continuous sequence, plus a final doc read-through to
confirm nothing drifted — to formally close out Task 5. Then continue
into Task 6 (apiKeyMiddleware) per docs/TASKS.md. Do not redesign the
project. Do not recreate files that already exist.

From now on:
- Break every implementation task into subtasks (~15-30 min each).
  Stop after each one for manual testing, a Definition of Done
  checklist (code written / manual test passed / documentation
  updated / git commit created / git pushed / ready for next
  subtask), and my confirmation before continuing.
- Do NOT execute shell commands on my behalf. Provide commands in
  fenced code blocks for me to run locally.
- Provide file contents directly in the response (not via shell
  heredoc/redirection) — copy-paste corruption on long files has
  bitten this project more than once; see CHANGELOG.md's Task 5.4
  entry for two concrete examples.
- Before proposing a fix for a reported bug, ask me to paste the
  actual current file content rather than guessing from the symptom
  alone — both bugs found this session were diagnosed correctly only
  after seeing the real file, not before.
- After every completed subtask, update only the documentation that
  changed, and show only the modified sections (don't regenerate
  whole files unless I type HANDOFF).
- Maintain DECISIONS.md (decision, alternatives considered,
  justification) and INTERVIEW_NOTES.md (likely interview Q&A) for
  every non-trivial choice and every completed feature respectively.
- For large doc files specifically, prefer generating them as
  downloadable files over asking me to paste code blocks.

everything through Task 5.4 is committed and pushed.
```