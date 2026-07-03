# Faultline — Handoff

## Handoff: Milestone 2, Task 8 (subtask 8.1 complete) — also closing a documentation gap

Generated at a subtask boundary, and also closing a documentation gap:
the previous session committed Task 8.1's code and most docs
(ARCHITECTURE.md, CHANGELOG.md, DECISIONS.md, INTERVIEW_NOTES.md,
PROJECT_CONTEXT.md) correctly, but the HANDOFF.md that landed in that
same commit was an unfinished draft — it still described the
end-of-Task-7.1 state. That gap is now closed — implementation was
already correct and complete; only this file was recovered this pass.

### Where things stand

Read `PROJECT_CONTEXT.md` first — it's accurate and current. Milestone
1 (full auth system) is complete and verified end-to-end. Milestone 2
is 4 of 6 tasks in:

- **Task 5** (Project model + CRUD + API key generation/hashing) —
  complete, subtasks 5.1–5.5, full lifecycle verified against live
  Atlas
- **Task 6** (apiKeyMiddleware) — complete, subtask 6.1, all 5 manual
  test cases passed
- **Task 7** (ingestion endpoint skeleton) — complete, subtask 7.1,
  `POST /api/events` validates and returns `202`, no persistence yet
- **Task 8** (stack normalizer + fingerprint service) — **in
  progress**, subtask 8.1 complete: `parseStackFrames`/`normalizeStack`
  in `server/utils/stackNormalizer.js`, manually verified
  (cross-environment path stability, node_modules exclusion,
  all-vendor fallback, async/anonymous frame parsing, garbage input).
  A real bug was caught during that verification: path anchoring used
  the *first* matching root-marker segment, which silently broke
  cross-environment fingerprint stability whenever the deploy root
  itself was also a marker word (Docker's `/app/server/...` matching
  `app` before the real root `server`). Fixed to anchor on the *last*
  match instead; re-verified with simulated local vs. Docker paths
  producing identical signatures. See `DECISIONS.md` for the full
  writeup.

**Not done yet:** Task 8.2 (`fingerprintService` — hashes the
normalized signature, combined with an extracted error type, into the
dedup key) onward.

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
│   │   ├── generateToken.js
│   │   └── stackNormalizer.js    (parseStackFrames, normalizeStack, normalizeFilePath — pure, no DB/req/res, consumed by fingerprintService in 8.2)
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
│   ├── API.md                 (unchanged this pass — Ingestion section already fully documented)
│   ├── ARCHITECTURE.md        (folder tree + layering note updated for stackNormalizer.js)
│   ├── CHANGELOG.md           (+ Task 8.1 entry, incl. the anchoring-bug fix)
│   ├── DATABASE.md            (unchanged this pass)
│   ├── DECISIONS.md           (+ stack-fingerprinting signature-design entry, incl. the bug writeup)
│   ├── HANDOFF.md             (this file — recovered this pass)
│   ├── INTERVIEW_NOTES.md     (+ Task 8.1 Q&A)
│   ├── PROJECT_CONTEXT.md     (accurate — 8.1 marked DONE, 8.2 NEXT)
│   └── TASKS.md                (unchanged — Task 8's parent checkbox correctly stays open until 8.2 lands)
├── .gitignore
└── README.md
```

### Files created/modified since the last handoff

**New (Task 8.1, previous session):** `server/utils/stackNormalizer.js`

**Modified (Task 8.1, previous session):** `docs/ARCHITECTURE.md`,
`docs/CHANGELOG.md`, `docs/DECISIONS.md`, `docs/INTERVIEW_NOTES.md`,
`docs/PROJECT_CONTEXT.md`

**Modified (this session — documentation recovery only, no code
changes):** `docs/HANDOFF.md` (this rewrite)

### Local environment note

Port 5000 is unusable on this machine — a respawning local process
(AirPlay Receiver, relaunched by `launchd` even after `kill -9`)
occupies it. Local `.env` sets `PORT=5050` to work around this.
`.env.example` and `env.js`'s fallback still correctly say `5000` as
the project's real default; unchanged since last handoff.

### Files remaining (per TASKS.md, Milestones 2–5)

`server/services/fingerprintService.js` (Task 8.2),
`server/models/ErrorGroup.js`, `server/models/ErrorEvent.js` (Task 9),
`demo-app/` Express app (Task 10), then Milestone 3's `aiService.js`
and GitHub-fetch pieces, then the full `client/` React app in
Milestones 4–5. Full list in `TASKS.md`.

### Current known bugs

None open. (The root-marker anchoring bug described above was caught
and fixed during Task 8.1's own manual verification, before commit —
not an open issue.)

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
  worth a quick spot-check before Task 8.2 builds persistence on top
  of this endpoint.
- Noted in `DECISIONS.md` for Task 8.2 specifically:
  `fingerprintService` should combine `normalizeStack()`'s signature
  with an extracted error *type* (parsed from `message`, not the full
  dynamic message text) before hashing — the full message often
  contains request-specific dynamic values that would otherwise
  fragment the fingerprint for what's really the same bug.

### Git state

Last commits: `968ef5c feat(utils): add stack normalizer for
cross-environment fingerprinting (Task 8.1)`, `c0932ee` (same subject
— code-only commit immediately prior), `4e03a07 task 7.1 completed`.
All pushed — working tree clean, branch up to date with
`origin/main`.

This session's work (the HANDOFF.md recovery above) is **not yet
committed** — staged for a suggested commit below, pending your
confirmation, no production code changes involved.

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
and 7 are complete and verified. Task 8.1 (stack normalizer) is also
complete and verified — server/utils/stackNormalizer.js. Task 8.2
(fingerprintService) is next, not yet started.

Continue into Task 8.2 per docs/TASKS.md and the note in DECISIONS.md
under "Stack fingerprinting". Do not redesign the project. Do not
recreate files that already exist.

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