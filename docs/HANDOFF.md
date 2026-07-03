# Faultline — Handoff

## Handoff: End of Milestone 2, Task 5 (subtasks 5.1–5.5 complete)

Generated at a subtask boundary — Task 5 is now fully closed. Milestone
2 continues into Task 6 next.

### Where things stand

Read `PROJECT_CONTEXT.md` first, then `TASKS.md`, then the most recent
entries in `CHANGELOG.md`. **Note:** as of this handoff, `PROJECT_CONTEXT.md`
is known to be stale — it still shows Task 5 as "NEXT" and doesn't list
the Project model/CRUD/API-key work as completed. Trust this file and
the actual code over `PROJECT_CONTEXT.md` until that's fixed.

Short version: Milestone 1 (full auth system) is complete and verified
end-to-end. Task 5 (Project model + CRUD + API key generation/hashing)
is now **fully complete**, subtasks 5.1 through 5.5:

- `Project` Mongoose model
- API key generation + SHA-256 hashing utility
- Full CRUD on `/api/projects` — create, list, get-one, update,
  delete — all JWT-protected, all ownership-scoped in the query
  itself
- **5.5 (this session):** full create → list → get → update → delete
  → post-delete-404 lifecycle run in one continuous sequence against
  the live MongoDB Atlas dev cluster. All 7 steps passed:
  - `updatedAt` correctly bumped on PATCH while `createdAt` stayed fixed
  - DELETE returned `204` with an empty body, as coded
  - GET after DELETE returned a generic `404 "Project not found"` —
    confirms the not-found/not-yours enumeration-avoidance design in
    `DECISIONS.md` is actually working, not just documented
  - Full request/response trail is in this session's chat log, not
    reproduced here

**Not done yet:** everything from Task 6 onward.

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
│   ├── app.js                    (mounts /api/auth and /api/projects)
│   ├── server.js
│   ├── package.json
│   ├── package-lock.json
│   ├── .env.example              (PORT=5000 — conventional default; see CHANGELOG.md's
│   │                               Known local-environment note for why local dev may override this)
│   └── .env                      (gitignored, local only — this machine uses PORT=5050,
│                                   see below)
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
│   ├── PROJECT_CONTEXT.md     (⚠ stale — see note above)
│   └── TASKS.md                (Task 5 now checked off)
├── .gitignore
└── README.md
```

### Files created/modified since the last handoff

**New this session:** none — 5.5 was verification-only, no new source
files.

**Modified this session:** `docs/TASKS.md` (Task 5 checked off),
`docs/HANDOFF.md` (this rewrite). No production code changes.

**Carried over from 5.1–5.4 (unchanged since):**
`server/models/Project.js`, `server/utils/apiKey.js`,
`server/services/projectService.js`,
`server/controllers/projectController.js`,
`server/routes/projectRoutes.js`, `server/app.js`.

### Local environment note

Port 5000 is unusable on this machine — a respawning local process
(the CHANGELOG's Task 1.2 entry attributes this to macOS AirPlay
Receiver, which `launchd` relaunches even after `kill -9`) occupies it.
Local `.env` sets `PORT=5050` to work around this. `.env.example` and
`env.js`'s fallback still correctly say `5000` — that's the project's
real default; the local override is machine-specific and intentionally
not propagated into tracked files. No code or docs change needed here,
this section just documents it for the next session so it isn't
re-investigated from scratch.

### Files remaining (per TASKS.md, Milestones 2–5)

`server/middleware/apiKeyMiddleware.js`,
`server/services/fingerprintService.js`,
`server/models/ErrorGroup.js`, `server/models/ErrorEvent.js`,
`server/services/aiService.js`, full `client/` React app, `demo-app/`
Express app. Full list in `TASKS.md`.

### Current known bugs

None open.

### Pending improvements / deferred items

- `AppError`/`catchAsync` refactor — still deliberately deferred to
  Task 20, per `DECISIONS.md`/`ARCHITECTURE.md`. Not a bug.
- The Atlas dev-cluster database user's password was posted in
  plaintext in chat during Task 2.1 debugging and still has not been
  rotated as of this session. Still low risk for a dev-only demo DB,
  but this is now pending across three sessions — worth actually doing
  (Atlas → Database Access → Edit → new password → update local
  `.env`).
- `apiKeyMiddleware` (Task 6) must compare the incoming key's hash
  against the stored hash using `crypto.timingSafeEqual`, not `===` —
  flagged in `DECISIONS.md`'s API-key-hashing entry so it isn't missed.
- **New this session:** `PROJECT_CONTEXT.md` is stale (see top of this
  file). Should be corrected before or during Task 6 so the next fresh
  session isn't misled by the file it's told to read first.

### Git state

Last commits (per prior session): `495209f feat(projects): add
get/update/delete with ownership scoping (Task 5.4)`, followed by
`f125a7e updating HANDSOFF.md` (doc-only). Both pushed.

This session's work (5.5 verification + this handoff + the `TASKS.md`
checkbox) is **not yet committed** — staged for a suggested commit,
pending your confirmation per the standing workflow:

```
test(projects): verify full CRUD lifecycle, close out Task 5

- Manual create → list → get → update → delete → 404 sequence run
  against live MongoDB Atlas dev cluster (see chat log for full
  request/response trail)
- Confirmed updatedAt bumps on PATCH, createdAt stays fixed
- Confirmed 404 (not 403) on access after delete, consistent with
  ownership-scoping enumeration-avoidance decision in DECISIONS.md
- docs/TASKS.md: Task 5 checked off
- docs/HANDOFF.md: handoff updated for Task 6 start

No production code changes — subtask 5.5 was verification-only.
```

### Ready-to-paste prompt for a new Claude session

```
The uploaded project ZIP reflects the latest state of the codebase.
Treat the files in the ZIP as the canonical implementation and the
documentation as the project's canonical memory. If there is a
conflict, explain it before making changes. Note: PROJECT_CONTEXT.md
is currently known to be stale (see docs/HANDOFF.md) — trust HANDOFF.md
and the actual code over it until it's corrected.

Before writing any code:
1. Read the architecture blueprint completely.
2. Read every file inside docs/, including PROJECT_CONTEXT.md,
   TASKS.md, CHANGELOG.md, API.md, DATABASE.md, ARCHITECTURE.md,
   AI_CONTEXT.md, HANDOFF.md, DECISIONS.md, INTERVIEW_NOTES.md.
3. Review the current repository structure and existing code.
4. Cross-check docs against actual code/git history before trusting
   any "DONE" status.

Milestone 1 (Backend Foundation) is complete and verified end-to-end.
Task 5 (Project model + CRUD + API key generation/hashing) is fully
complete, subtasks 5.1–5.5, including a full manual CRUD lifecycle
verification against a live MongoDB Atlas dev cluster. Full detail in
docs/HANDOFF.md's latest entry.

Continue into Task 6 (apiKeyMiddleware) per docs/TASKS.md. Remember:
it must use crypto.timingSafeEqual for the hash comparison, not ===
(see DECISIONS.md). Do not redesign the project. Do not recreate files
that already exist. Also fix PROJECT_CONTEXT.md's stale Task 5 status
before or during this task.

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
  changed, and show only the modified sections.
- Maintain DECISIONS.md and INTERVIEW_NOTES.md for every non-trivial
  choice and completed feature respectively.
- For large doc files specifically, prefer generating them as
  downloadable files.

Everything through Task 5.5 is verified; the closeout commit above is
staged but not yet made pending confirmation.
```