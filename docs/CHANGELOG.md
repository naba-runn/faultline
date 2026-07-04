# Changelog

Format loosely follows [Keep a Changelog](https://keepachangelog.com/).
Entries are added per task, not per commit-within-a-task.

## [Unreleased]

### Added — Task 12: GitHub Contents API fetch (grounding)
- `server/services/githubService.js` — `fetchCodeSnippet()` (best-effort,
  returns windowed snippet or `null` on any failure), `extractSnippet()`
  (pure, ±15-line window around a target line, line-number-prefixed)
- `server/config/env.js`, `server/.env.example` — added optional
  `GITHUB_TOKEN`
- Manually verified: `extractSnippet` locally (centered window, clamped
  at file start/end, empty input, invalid line number all handled);
  `fetchCodeSnippet` live against a real public repo (valid file
  fetched, missing file returns `null`, no-repo-configured returns
  `null`, malformed `githubRepo` string returns `null`)

### Added — Task 11: aiService (buildPrompt / callGemini / parseAndValidate)
- `server/services/aiService.js` — `buildPrompt` (pure), `callGemini`
  (thin `@google/genai` wrapper, `gemini-2.5-flash`, JSON
  `responseSchema` mode), `parseAndValidate` (pure, returns
  `{ rootCause, severity, suggestedFix }` or `null` on any malformed/
  invalid response)
- `server/package.json` — added `@google/genai@^2.10.0`
- Manually verified: `buildPrompt`/`parseAndValidate` locally (valid
  doc, bad severity, malformed JSON, empty `suggestedFix` all handled
  correctly); `callGemini` against a live API key (real Gemini call,
  response validated end-to-end)

### Added — Task 10: demo Express app
- `demo-app/index.js` — Express app with three routes (`/crash/type-error`,
  `/crash/range-error`, `/crash/custom`) that each throw a distinct
  error, caught by an error-handling middleware that forwards it to
  Faultline's `/api/events` (fire-and-forget, never blocks or crashes
  the demo app itself)
- `demo-app/package.json`, `.env.example`, `README.md` — setup/usage
- Manually verified end-to-end against live server + Atlas: repeated
  hits on one route collapsed into one `ErrorGroup` (`count: 3`), the
  other two each produced their own `ErrorGroup` (`count: 1`); 5 total
  `ErrorEvent` docs split 3/1/1 across the three groups, all correctly
  linked

### Added — Task 9.3: wire dedup into ingestController
- `server/services/errorGroupService.js` — `recordEvent()`: fingerprints
  the event, atomically upserts the owning `ErrorGroup` via
  `findOneAndUpdate(..., { upsert: true })` keyed on `{ projectId,
  fingerprint }`, and creates the linked `ErrorEvent`. First-occurrence
  detected from `lastErrorObject.upserted`, not a separate existence
  check. `message`/`stackSample` set only on insert; `count`/`lastSeen`
  updated on every call.
- `server/controllers/ingestController.js` — now calls `recordEvent`
  instead of just validating + 202ing; response includes `errorGroupId`
  and `isNewGroup`; added a 500 path for persistence failures.
- Manually verified against live Atlas: duplicate event collapses into
  one `ErrorGroup` with `count: 2`, two linked `ErrorEvent` docs;
  distinct event produces a separate `ErrorGroup` with `count: 1`

### Added — Task 9.2: ErrorEvent model
- `server/models/ErrorEvent.js` — schema per `DATABASE.md`'s locked-in
  shape: `errorGroupId` (ref `ErrorGroup`), `rawStack`, `env`,
  `metadata` (free-form, unvalidated per `API.md`), `receivedAt`. No
  unique index — many events legitimately belong to one group.
-  Manually verified: valid doc validates clean, required-field
  rejection on both `errorGroupId` and `rawStack`, all defaults correct

### Added — Task 9.1: ErrorGroup model
- `server/models/ErrorGroup.js` — schema per `DATABASE.md`'s locked-in
  design: `projectId`, `fingerprint`, `message`, `stackSample`,
  `status` (enum, default `open`), `statusHistory[]`, `aiSummary`
  (nested, nullable), `count`, `firstSeen`/`lastSeen`. Compound unique
  index on `{ projectId, fingerprint }`.
- Manually verified: valid doc validates clean, required-field
  rejection, bad enum rejection, all defaults correct

### Added — Task 8.2: Fingerprint service
- `server/services/fingerprintService.js` — `generateFingerprint()`:
  combines an extracted error type with `stackNormalizer`'s normalized
  signature, hashed via SHA-256, into the dedup key Task 9's
  `ErrorGroup` upsert will use; `extractErrorType()`: parses the
  conventional `SomeError:` message prefix, falling back to a generic
  `"Error"` bucket when unrecognized
- Manually verified: cross-environment + dynamic-message equality,
  type-mismatch produces a different fingerprint, extractErrorType
  edge cases (typed, untyped, undefined message), stackless-message
  fallback determinism

### Added — Task 8.1: Stack normalizer utility
- `server/utils/stackNormalizer.js` — `parseStackFrames()`: parses a
  raw V8/Node stack trace into structured frames (function name, file,
  line, column), skipping unparseable lines rather than throwing;
  `normalizeStack()`: reduces a stack to a stable signature — app-code
  frames only (node_modules/node:/internal frames filtered out, falls
  back to all frames if none remain), capped at the top 5, each
  frame's path anchored to its last recognized project-root segment
  instead of the full absolute path; `normalizeFilePath()`: the
  path-anchoring helper on its own
- Found and fixed during manual verification: anchoring on the
  *first* matching root-marker segment (rather than the last) broke
  cross-environment stability whenever the deploy root itself was
  also a marker word — e.g. Docker's `/app/server/...` matched `app`
  before reaching the real root `server`, producing a different
  signature than the same file locally. Fixed by anchoring on the
  last match instead. See `DECISIONS.md` for detail.
- Verified manually (no HTTP surface — pure functions): identical
  signature for the same logical stack under simulated local vs.
  Docker-style absolute paths; node_modules/Node-internal frames
  correctly excluded; falls back to all frames when every frame is
  non-app code; anonymous frames parsed correctly including the
  `async` prefix case; empty/unparseable input degrades to an empty
  signature rather than throwing

### Task 7 complete: Ingestion endpoint skeleton
`POST /api/events` now validates and acknowledges incoming error
events behind `apiKeyMiddleware`, returning `202` without persisting
anything — a deliberate skeleton ahead of Task 8 (fingerprinting) and
Task 9 (`ErrorGroup`/`ErrorEvent` models). `API.md` documents the full
request/response contract; `DECISIONS.md` records why `202` and why
`env`/`metadata` are accepted-but-unused for now.

### Added — Task 7.1: Ingestion endpoint skeleton
- `server/controllers/ingestController.js` — `ingestEvent()`: validates
  `message` and `stack` as required strings, returns `202 Accepted`
  with `{ received: true, projectId }`; deliberately does not persist,
  fingerprint, or dedup — `ErrorGroup`/`ErrorEvent` don't exist until
  Task 9, `fingerprintService` doesn't exist until Task 8
- `server/routes/ingestRoutes.js` — mounts `apiKeyMiddleware` ahead of
  `POST /`, wired into `app.js` at `/api/events`
- `server/app.js` — removed the Task 6.1 temporary
  `/api/_test/verify-key` route now that `apiKeyMiddleware` has its
  real mount point
- `docs/API.md` — full Ingestion section: request/response shapes, all
  failure modes (missing `message`, missing `stack`, bad/missing API key)
- `docs/DATABASE.md` — note under "Planned Collections" clarifying the
  endpoint doesn't persist yet
- `docs/DECISIONS.md` — new "Ingestion endpoint is a skeleton, not full
  ingestion" entry: explains `202` vs `201`, and why `env`/`metadata`
  are accepted but not yet validated
- `docs/INTERVIEW_NOTES.md` — added Task 7 Q&A (why `202` not `201`,
  why accept unused fields, how this extends into real ingestion)
- Verified manually: valid key + valid body → `202`; missing `message`
  → `400`; missing `stack` → `400`; missing/invalid API key → `401`
  (via `apiKeyMiddleware`). Status codes confirmed for all cases;
  response *bodies* were not individually re-confirmed byte-for-byte
  this session — worth a spot-check before Task 8 builds on top

### Task 6 complete: apiKeyMiddleware
API-key authentication for the ingestion path is done and verified —
separate from JWT `authMiddleware` by design, since it authenticates a
client program, not a dashboard user.

### Added — Task 6.1: API key middleware
- `server/middleware/apiKeyMiddleware.js` — verifies `Authorization:
  Bearer flt_...`, hashes the raw key (SHA-256 via `hashApiKey`),
  looks it up with an indexed `Project.findOne({ apiKeyHash })`, then
  double-checks the match with `crypto.timingSafeEqual` before
  attaching `req.project`; uniform `401` for every failure mode
  (missing header, malformed key, no match, deleted-project key) —
  same enumeration-avoidance pattern used throughout auth/projects
- `server/app.js` — added a temporary `GET /api/_test/verify-key`
  route to exercise the middleware in isolation ahead of Task 7's real
  mount point (removed in Task 7.1, see above)
- `docs/DECISIONS.md` — closed the Task 6 forward-reference left in
  the API-key-hashing decision, confirming the `timingSafeEqual`
  implementation as specified
- `docs/INTERVIEW_NOTES.md` — added Task 6 Q&A (why a separate
  middleware from `authMiddleware`, why hash-lookup + `timingSafeEqual`,
  uniform failure response)
- Verified manually, all 5 cases: valid key → `200`; missing header,
  malformed key, wrong key, and a key belonging to a deleted project →
  all `401`

### Task 5 complete: Project model + CRUD + API key generation/hashing
Milestone 2's first task, fully closed across five subtasks (5.1–5.5):
`Project` model, API-key generation/hashing utility, full CRUD
(create/list/get/update/delete), all JWT-protected and
ownership-scoped in the query itself, verified end-to-end against a
live MongoDB Atlas dev cluster including the enumeration-avoidance
`404` behavior.

### Added — Task 5.5: Full CRUD lifecycle verification
- No new source files — verification-only subtask
- Full create → list → get → update → delete → post-delete-`404`
  sequence run in one continuous pass against the live MongoDB Atlas
  dev cluster: `updatedAt` correctly bumped on `PATCH` while
  `createdAt` stayed fixed; `DELETE` returned `204` with an empty
  body; `GET` after `DELETE` returned a generic `404 "Project not
  found"`, confirming the not-found/not-yours enumeration-avoidance
  design in `DECISIONS.md` is actually working, not just documented
- `docs/TASKS.md` — Task 5 checked off
- `docs/HANDOFF.md`, `docs/PROJECT_CONTEXT.md` — corrected stale Task
  5 status (`PROJECT_CONTEXT.md` had been showing Task 5 as "NEXT"
  since 5.1–5.4 had already landed)

### Added — Task 5.4: Project read-one, update, delete
- `server/services/projectService.js` — `getProject()`,
  `updateProject()`, `deleteProject()`, all scoped by `{ _id, ownerId }`
  so a user can only ever touch their own project; not-found and
  not-yours are deliberately indistinguishable (both return `null`/
  `false`) — same enumeration-avoidance principle as login (see
  DECISIONS.md)
- `server/controllers/projectController.js` — `getProject()`,
  `updateProject()`, `deleteProject()`; all three map Mongoose
  `CastError` (malformed ObjectId in the URL) to `404`, not `500`
- `server/routes/projectRoutes.js` — `GET/PATCH/DELETE /:id`, all
  `authMiddleware`-guarded
- Fixed during manual testing: a duplicate `module.exports` at the end
  of `projectService.js` was silently overwriting the real one,
  dropping `getProject`/`updateProject`/`deleteProject` from what the
  file actually exported (no syntax error — just missing functions at
  call time). Removed the stray second export.
- Verified manually: get-by-id returns the correct project; a
  well-formed but nonexistent ObjectId returns 404; a malformed ID
  string returns 404 (not 500); update changes `name`/`githubRepo` and
  bumps `updatedAt`; update with a malformed `githubRepo` returns 400;
  delete returns 204; a get immediately after delete returns 404,
  confirming the delete actually took effect

### Added — Task 5.3: Project create + list endpoints
- `server/services/projectService.js` — `createProject()`: generates
  a raw API key, hashes it, persists only the hash, returns the raw
  key alongside the shaped project (the only point the raw key ever
  exists — never stored, never returned again); `listProjects()`:
  returns all of the caller's projects, most recent first, shaped
  output never includes `apiKeyHash`
- `server/controllers/projectController.js` — `createProject()`,
  `listProjects()`, thin, maps `ValidationError` to 400
- `server/routes/projectRoutes.js` — `POST /`, `GET /`, both behind
  `authMiddleware` (JWT) — deliberately not API-key auth, since these
  are dashboard-user actions, not the ingestion path (see
  PROJECT_CONTEXT.md decision #5)
- Wired into `server/app.js` at `/api/projects`
- Verified manually: no-auth request → 401; missing `name` → 400;
  malformed `githubRepo` → 400 with the validator's message surfaced
  correctly through the controller; valid create → 201 with a
  `flt_`-prefixed raw key returned exactly once; list → 200 with the
  created project, confirmed `apiKeyHash` is absent from the response
  in both the create and list payloads

### Added — Task 5.2: API key generation + hashing utility
- `server/utils/apiKey.js` — `generateApiKey()`: 32 random bytes
  (crypto.randomBytes) as hex, prefixed `flt_`; `hashApiKey(rawKey)`:
  SHA-256 hash for storage. Pure functions, no DB, no req/res — same
  style as `generateToken.js`. SHA-256 chosen over bcrypt deliberately
  (see DECISIONS.md) — API keys are high-entropy random strings, not
  human-chosen secrets, and this will sit on the hot ingestion path in
  Task 6
- Verified manually: keys are `flt_`-prefixed and unique per call,
  64-char hex (32 bytes), hashing is deterministic (same key → same
  hash) and collision-free across different keys, hash differs from
  the raw key

### Added — Task 5.1: Project model
- `server/models/Project.js` — Mongoose schema: `ownerId` (ref `User`,
  indexed), `name`, `apiKeyHash`, `githubRepo` (optional, validated
  against `^[\w.-]+\/[\w.-]+$`), timestamps (`createdAt` + `updatedAt`
  — see DECISIONS.md for why Project tracks `updatedAt` when `User`
  doesn't)
- Verified manually against the Atlas dev cluster: valid project with
  `githubRepo` set saves correctly with real timestamps; valid project
  with `githubRepo` omitted saves with `null`; malformed `githubRepo`
  and missing `name` both correctly rejected with `ValidationError`;
  read-back and delete round-trip confirmed

### Milestone 1 complete: Backend Foundation
Tasks 1–4 done: Express skeleton, MongoDB connection + User model,
register/login with bcrypt + JWT, and JWT auth middleware with a
protected `/me` route. Full auth flow — register, login, protect,
reject invalid/missing/expired tokens — verified end-to-end against a
live MongoDB Atlas dev cluster. `API.md` documents all implemented
endpoints with real request/response shapes.

### Task 4 complete: authMiddleware + protected route guard
`GET /api/auth/me` added and verified against all 4 auth-middleware
paths (valid, missing, invalid, expired token). `API.md` updated. See
subtask entries below (4.1–4.2).

### Added — Task 4.2: Protected route `GET /api/auth/me`
- `server/controllers/authController.js` — `me()`: returns `req.user`
  as attached by `authMiddleware` (passwordHash already excluded)
- `server/routes/authRoutes.js` — `GET /me`, guarded by `authMiddleware`
- Verified manually, all four cases: valid token → 200 + user; missing
  token → 401 ("no token provided"); invalid token → 401 ("invalid or
  expired"); expired token → 401 (same message as invalid, same catch
  path in the middleware — confirmed via response byte-size match)

### Added — Task 4.1: Auth middleware
- `server/middleware/authMiddleware.js` — verifies `Authorization:
  Bearer <token>`, decodes via `jwt.verify`, loads the user (excluding
  `passwordHash`) and attaches as `req.user`; rejects with a uniform
  401 for missing header, invalid/expired token, or a token whose user
  no longer exists (same enumeration-avoidance approach as login)
- Verified via load/syntax sanity check only — full functional
  verification (valid/missing/invalid/expired token against a real
  route) happens in Task 4.2, where the protected route exists

### Task 3 complete: Register/login endpoints (bcrypt + JWT)
Full auth flow verified end-to-end: successful register/login, missing
fields (400), Mongoose validation errors (400, e.g. bad email format),
duplicate email (409), wrong password (401), nonexistent email (401,
identical message/status to wrong password — no enumeration leak).
`API.md` updated with real request/response shapes for both endpoints.
Used plain try/catch throughout, as planned — `AppError`/`catchAsync`
intentionally deferred to Task 20. See subtask entries below for the
individual pieces (3.1–3.3).

### Added — Task 3.3: Login endpoint
- `server/services/authService.js` — `login()`: looks up user by
  email, compares password via `user.comparePassword()`, issues a JWT
  on success. User-not-found and wrong-password paths deliberately
  return the identical error/status (401, "Invalid email or password")
  to avoid account-enumeration
- `server/controllers/authController.js` — `login()`
- `server/routes/authRoutes.js` — `POST /login`
- Verified manually: correct credentials → 200 + user + token; wrong
  password → 401; nonexistent email → 401 with the same message as
  wrong password (enumeration check passed)

### Added — Task 3.2: Register endpoint
- `server/services/authService.js` — `register()`: creates a User
  (model hashes the password), catches Mongo's duplicate-key error
  (code 11000) and rethrows as a 409, issues a JWT on success
- `server/controllers/authController.js` — `register()`: thin,
  validates required fields, maps service/Mongoose errors to status
  codes (plain try/catch for now — AppError/catchAsync land in Task 20)
- `server/routes/authRoutes.js` — `POST /register`
- Wired into `server/app.js` at `/api/auth`
- Verified manually: successful registration returns 201 with user
  (no passwordHash exposed) + JWT; duplicate email returns 409

### Added — Task 3.1: JWT signing utility
- `server/utils/generateToken.js` — pure function, signs a JWT with
  `sub` (standard claim) set to the user ID, expiry from `config.jwtExpiresIn`
- Verified manually: token generated and successfully decoded/verified
  with the configured secret

### Task 2 complete: MongoDB connection + User model
Full flow verified end-to-end against the Atlas dev cluster: connect
on boot, create/read/delete, field validation, bcrypt hashing +
comparison, and — critically — the unique email index enforced at the
DB level (duplicate insert correctly fails with Mongo error 11000,
not just rejected by app-level validation). `DATABASE.md` updated
with the real implemented `User` schema. See subtask entries below for
the individual pieces (2.1–2.3).

### Added — Task 2.3: Password hashing
- `server/models/User.js` — pre-save hook hashes `passwordHash` via
  bcrypt (cost factor 12) only when the field is new/modified;
  `comparePassword(candidatePassword)` instance method for login
- Verified manually: stored value is a bcrypt hash (not plaintext),
  correct password compares true, incorrect password compares false

### Added — Task 2.2: User model
- `server/models/User.js` — Mongoose schema: `name`, `email` (unique
  index, lowercased, regex-validated), `passwordHash`, `createdAt`
  (via `timestamps: { createdAt: true, updatedAt: false }` — matches
  the field set specified in DATABASE.md exactly, no extra fields)
- Verified manually: create + read + delete round-trip against the
  Atlas dev cluster, including validation and the unique-email index

### Added — Task 2.1: MongoDB connection
- `server/config/db.js` — Mongoose connection helper, exits process on
  connection failure, logs on disconnect
- `server/server.js` updated to `await connectDB()` before the app
  starts listening, so nothing accepts traffic before Mongo is reachable
- Connected to a MongoDB Atlas M0 (free tier) cluster for dev, per the
  Task 24 deployment plan (Atlas is used from day one rather than a
  local install, avoiding a dev/prod parity gap)
- Verified manually: `npm run dev` prints `[db] MongoDB connected: ...`
  before the server-listening line

### Task 1 complete: Monorepo init & Express skeleton
Full backend skeleton verified end-to-end from a clean `npm run dev`
boot: `GET /health` → 200, `POST /health` → 404 (method-matching
confirmed working, not just path-matching), unknown routes → 404.
`.gitignore` confirmed correctly excluding `.env` while
`server/package-lock.json` and the `docs/DECISIONS.md` /
`docs/INTERVIEW_NOTES.md` stubs are now tracked. See subtask entries
below for the individual pieces (1.1–1.4).

### Added — Task 1.4: Server bootstrap
- `server/server.js` — starts the Express app on `config.port`, guards
  against `unhandledRejection` and `uncaughtException` by logging and
  exiting the process cleanly (`server.close()` then `process.exit(1)`)
  rather than limping along in a broken state
- Verified manually via `npm run dev` (nodemon) + `/health` request
  through the real bootstrap path

### Added — Task 1.3: Express app skeleton
- `server/app.js` — helmet security headers, CORS restricted to
  `config.clientOrigin`, JSON/urlencoded body parsing capped at 100kb,
  morgan request logging (`dev` locally / `combined` in production),
  `GET /health` liveness endpoint, 404 handler, stub centralized error
  handler (replaced with `AppError`/`catchAsync` in Task 20)
- Verified manually: `/health` returns 200 with status payload, unknown
  routes return a 404 JSON body

### Known local-environment note
- On macOS (Monterey+), port 5000 is claimed by AirPlay Receiver
  (`ControlCenter`), which `launchd` respawns even after `kill -9`.
  Local dev uses `PORT=5050` in `.env` to avoid this; `.env.example`
  still documents `5000` as the conventional default since it's not a
  concern on Linux/CI/production hosts.

### Added — Task 1.2: Environment config loader
- `server/config/env.js` — loads `.env` via dotenv, validates presence
  of required vars (`MONGODB_URI`, `JWT_SECRET`) with a console warning
  (not a hard crash — server.js decides whether to refuse to start),
  exports a single typed `config` object
- `server/.env` (local, gitignored) populated from `.env.example` for
  local dev

### Added — Task 1.1: Monorepo folder structure + package.json + .env.example
- `server/` subfolders scaffolded: `config/`, `controllers/`,
  `services/`, `middleware/`, `routes/`, `models/`, `utils/`
- `client/` and `demo-app/` placeholder directories with `README.md`
  stubs (real scaffolding lands in Task 15 and Task 10 respectively)
- `server/package.json` with core dependencies (express, mongoose,
  bcryptjs, jsonwebtoken, helmet, cors, express-rate-limit, morgan,
  dotenv) and dev dependency (nodemon)
- `server/.env.example` documenting required env vars (Mongo URI, JWT
  secret/expiry, Gemini API key, client origin for CORS)

> Note: earlier entries in this file previously claimed Task 1 was
> fully complete (app.js, server.js, config/env.js included). That was
> incorrect — the code was never committed. See PROJECT_CONTEXT.md for
> the correction. This changelog now reflects only what's actually in
> the repo, tracked per subtask.