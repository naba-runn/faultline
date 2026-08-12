# Faultline — Architecture

## Current Folder Structure (reflects actual repo state, not the plan)

```
faultline/
├── client/                 (Vite + React, Tasks 15-35)
│   ├── src/
│   │   ├── api/axios.js              (shared axios instance — request interceptor attaches JWT, response interceptor clears it on 401)
│   │   ├── context/AuthContext.jsx   (user/token/loading state, login/register/logout, bootstraps via GET /api/auth/me)
│   │   ├── components/ProtectedRoute.jsx (gates a route on AuthContext's isAuthenticated; redirects to /login)
│   │   ├── components/SdkSnippetGenerator.jsx (Task 34 — cURL, Node.js, Python snippet tabs with 1-click copy)
│   │   ├── pages/LoginPage.jsx       (email/password form → AuthContext.login)
│   │   ├── pages/RegisterPage.jsx    (name/email/password form → AuthContext.register)
│   │   ├── pages/DashboardPage.jsx   (project list + create-project form + SDK snippet drawer; GET/POST /api/projects)
│   │   ├── pages/ProjectDetailPage.jsx (project info + filterable error group table + saved views + SDK setup; Tasks 17, 33, 34)
│   │   ├── pages/GroupDetailPage.jsx (AI summary, event list, trend badge, resolved stack traces; Tasks 19, 29, 31, 32)
│   │   ├── pages/ApiDocsPage.jsx     (Task 35 — public API reference viewer at /docs, marked parser + TOC sidebar)
│   │   ├── App.jsx                  (react-router-dom routes: /login, /register, /docs, /dashboard, /projects/:id, /groups/:id)
│   │   └── main.jsx
│   └── README.md
├── server/
│   ├── config/
│   │   ├── env.js           (centralized env var loader)
│   │   └── db.js             (Mongoose connection to Atlas)
│   ├── controllers/
│   │   ├── authController.js        (register, login, me)
│   │   ├── projectController.js     (createProject, listProjects, getProject, updateProject, deleteProject, listProjectGroups, simulateError, mintSseTicket)
│   │   ├── groupController.js       (getGroupDetail, updateStatus)
│   │   ├── ingestController.js      (ingestEvent — validates, threads release/env, persists via errorGroupService, 202s)
│   │   ├── sourceMapController.js   (uploadSourceMap, listSourceMaps, deleteSourceMap — Task 32)
│   │   ├── alertConfigController.js (getAlertConfig, updateAlertConfig — Tasks 28/30)
│   │   ├── docsController.js        (getDocs — reads API.md from filesystem, Task 35)
│   │   └── sseController.js         (streamEvents — Task 26)
│   ├── services/
│   │   ├── authService.js         (register, login — business logic, no req/res)
│   │   ├── projectService.js      (create/list/get/update/delete — all ownership-scoped in the query itself)
│   │   ├── fingerprintService.js  (generateFingerprint, extractErrorType — pure, combines stackNormalizer signature + error type)
│   │   ├── errorGroupService.js   (recordEvent, enrichErrorGroup, updateGroupStatus, getGroupDetail, listErrorGroups)
│   │   ├── sourceMapService.js    (validateSourceMap, uploadSourceMap, listSourceMaps, deleteSourceMap, resolveStack — Task 32)
│   │   ├── trendService.js        (computeTrend, getWindowBounds — baseline spike detection, Task 29)
│   │   ├── alertService.js        (sendAlertEmail, evaluateSpike — Resend email alerts & spike engine, Tasks 28/30)
│   │   ├── aiService.js           (buildPrompt/callGemini/parseAndValidate — Task 11)
│   │   ├── githubService.js       (fetchCodeSnippet/extractSnippet — GitHub Contents API grounding, Task 12)
│   │   └── sseHub.js              (publish, subscribe, disconnect — Redis pub/sub live fan-out, Task 26)
│   ├── middleware/
│   │   ├── authMiddleware.js      (JWT verification, attaches req.user)
│   │   ├── apiKeyMiddleware.js    (API-key verification, attaches req.project — hot ingestion path)
│   │   ├── rateLimiter.js         (loginLimiter, ingestLimiter — express-rate-limit)
│   │   └── errorMiddleware.js     (centralized error handler, Task 20.1)
│   ├── routes/
│   │   ├── authRoutes.js        (POST /register, POST /login, GET /me)
│   │   ├── projectRoutes.js     (POST /, GET /, GET/PATCH/DELETE /:id, GET /:id/groups, POST /:id/simulate, POST /:id/sse-ticket)
│   │   ├── groupRoutes.js       (GET /:id, PATCH /:id/status)
│   │   ├── ingestRoutes.js      (POST / — apiKeyMiddleware + ingestLimiter-guarded, mounted at /api/events)
│   │   ├── sourceMapRoutes.js   (POST/GET/DELETE /api/projects/:id/sourcemaps — Task 32)
│   │   ├── alertConfigRoutes.js (GET/PATCH /api/projects/:id/alerts — Tasks 28/30)
│   │   ├── docsRoutes.js        (GET /api/docs — Task 35)
│   │   └── sseRoutes.js         (GET /api/sse/stream — ticket-authenticated, Task 26)
│   ├── models/
│   │   ├── Project.js           (ownerId ref User, name, apiKeyHash unique-indexed, githubRepo validated)
│   │   ├── ErrorGroup.js        (projectId + fingerprint compound-unique index; status, aiSummary, firstSeenRelease)
│   │   ├── ErrorEvent.js        (errorGroupId ref, rawStack, env, release, metadata, receivedAt)
│   │   ├── SourceMap.js         (projectId + release + filename compound-unique index, map v3 payload — Task 32)
│   │   └── User.js              (name, email unique, passwordHash w/ bcrypt hook)
│   ├── utils/
│   │   ├── apiKey.js            (generateApiKey, hashApiKey — SHA-256)
│   │   ├── generateToken.js     (JWT signing helper)
│   │   ├── httpResponse.js      (sendSuccess/sendError — response-shaping helper)
│   │   ├── stackNormalizer.js   (parseStackFrames, normalizeStack)
│   │   ├── AppError.js          (operational-error class)
│   │   └── catchAsync.js        (async-handler rejection wrapper)
│   ├── tests/
│   │   ├── errorGroupService.test.js
│   │   ├── sourceMapService.test.js
│   │   ├── trendService.test.js
│   │   ├── alertService.test.js
│   │   └── docs.test.js
│   ├── app.js                   (Express app bootstrapping)
│   ├── server.js                (API process entrypoint)
│   ├── worker.js                (BullMQ background worker process entrypoint — Task 25)
│   ├── package.json
│   └── .env.example
├── demo-app/                   (Throws sample errors & tests minified source maps — Tasks 10, 32)
│   ├── minified-demo.js
│   ├── package.json
│   └── README.md
├── docs/                       (Permanent project memory & live API docs)
└── README.md
```

## Layering Convention (applies once controllers/services exist)

```
routes/       → maps HTTP verb+path to a controller function
controllers/  → thin: parse req, call a service, shape the response
services/     → business logic; no req/res objects ever passed in
middleware/   → cross-cutting concerns (auth, validation, rate limiting)
models/       → Mongoose schemas only, no business logic
utils/        → pure helper functions (catchAsync, AppError, stackNormalizer)
```

Rule of thumb enforced throughout: **controllers never touch Mongoose
directly**, and **services never touch `req`/`res`**. This is what
keeps services unit-testable without spinning up Express.

## Request Flow

```
Client → app.js middleware chain (helmet → cors → json → morgan)
       → /health route
       → /api/auth/register          → authController.register → authService.register → User (bcrypt hook)
       → /api/auth/login             → loginLimiter → authController.login → authService.login → User.comparePassword
       → /api/auth/me                → authMiddleware (verifies JWT, loads req.user) → authController.me
       → /api/projects (POST)         → authMiddleware → projectController.createProject → projectService.createProject
       → /api/projects (GET)          → authMiddleware → projectController.listProjects  → projectService.listProjects
       → /api/projects/:id (GET/PATCH/DELETE) → authMiddleware → projectController.* → projectService.*
       → /api/projects/:id/groups (GET) → authMiddleware → projectController.listProjectGroups → errorGroupService.listErrorGroups (search/filter/severity/pagination — Task 33)
       → /api/projects/:id/sourcemaps (POST/GET/DELETE) → sourceMapController.* → sourceMapService.* (Task 32)
       → /api/projects/:id/alerts (GET/PATCH) → alertConfigController.* → alertService.* (Tasks 28/30)
       → /api/docs (GET)             → docsController.getDocs (reads API.md from filesystem — Task 35)
       → /api/projects/:id/sse-ticket (POST) → authMiddleware → projectController.mintSseTicket (mints 30s single-use ticket in Redis — Task 26)
       → /api/groups/:id (GET)         → authMiddleware → groupController.getGroupDetail → errorGroupService.getGroupDetail (source map resolution + trend computation — Tasks 19, 29, 32)
       → /api/groups/:id/status (PATCH) → authMiddleware → groupController.updateStatus → errorGroupService.updateGroupStatus → sseHub.publish(projectId, "status_changed")
       → /api/events (POST)          → apiKeyMiddleware (verifies API key hash, loads req.project) → ingestLimiter
                                     → ingestController.ingestEvent → errorGroupService.recordEvent (supports env & release tags — Task 31)
                                         → fingerprintService.generateFingerprint
                                         → atomic upsert on ErrorGroup { projectId, fingerprint }
                                         → ErrorEvent.create (per-occurrence record)
                                         → responds 202 { received, projectId, errorGroupId, isNewGroup }
                                         → (isNewGroup only) sseHub.publish(projectId, "new_group")
                                         → (isNewGroup only) enrichmentQueue.enqueueEnrichment (BullMQ on Redis)
                                         → (if alertConfig.spikeDetection enabled) alertService.evaluateSpike (Task 30)
       → /api/projects/:id/simulate (POST) → authMiddleware → projectController.simulateError → errorGroupService.recordEvent
       → /api/sse/stream (GET, ?ticket=...) → sseController.streamEvents (ticket-authenticated SSE connection — Task 26)
       → (no match) 404 handler
       → (thrown error) errorMiddleware.js — centralized AppError handler
```→ (isNewGroup only, not awaited) enrichmentQueue.enqueueEnrichment
                                      → BullMQ job on Redis (Render Key Value) — see worker.js below, Task 25
       → /api/projects/:id/simulate (POST) → authMiddleware → projectController.simulateError → errorGroupService.recordEvent (same as above) → sseHub.publish + enrichmentQueue.enqueueEnrichment (same as above, Task 23/25/26)
       → /api/sse/stream (GET, ?ticket=...)     → sseController.streamEvents — deliberately NOT behind authMiddleware (see below, Task 26)
       → (no match) 404 handler
       → (thrown error) errorMiddleware.js — centralized handler (Task 20.1): AppError → trusted status/message; CastError → generic 404; ValidationError → 400; anything else → logged server-side, generic 500 to client
```

**Task 26 — Server-Sent Events:** `GET /api/sse/stream?ticket=...` is
the one route in this app not behind `authMiddleware` — native
`EventSource` can't send a header, so there's no JWT to check.
Security instead comes from the ticket: minted by
`POST /api/projects/:id/sse-ticket` (JWT-authed, ownership-checked,
same as every other project route), stored in Redis with a 30s TTL,
and burned on first use via an atomic `GETDEL`. All three emit points
above (`new_group`, `status_changed`, `enrichment_completed`) publish
to one Redis pub/sub channel (`services/sseHub.js`) rather than
calling connected clients directly — this is what lets `worker.js`, a
genuinely separate process with no HTTP connections of its own,
still reach dashboard clients connected to the API process. See
`DECISIONS.md`'s "Task 26" entry for the full reasoning, including why
one shared Redis subscriber connection is used for the whole process
rather than one per SSE client (Render's free Key Value tier has a
real, published connection cap).

**Separate process (`server/worker.js`, Task 25)** — its own Render
Background Worker service in deployment, not part of the Express
process above:
```
worker.js → connectDB (same as server.js) → BullMQ Worker consumes "enrichment" queue
    → re-fetches ErrorGroup.findById + Project.findById by the job's IDs (never trusts the serialized payload beyond IDs/message/stack)
    → errorGroupService.enrichErrorGroup
        → githubService.fetchCodeSnippet (only if project.githubRepo set; never throws — best-effort, returns null on failure)
        → aiService.buildPrompt → aiService.callGemini → aiService.parseAndValidate
        → ErrorGroup.findByIdAndUpdate: aiSummary { rootCause, severity, suggestedFix, confidence, affectedFile, affectedFunction }
        → a Gemini/Mongo failure here THROWS (propagates to the worker, triggering BullMQ retry — 3 attempts, exponential backoff)
        → a Gemini-response-fails-our-own-validation outcome does NOT throw — terminal, aiSummary stays null (retrying an identical prompt won't produce a different result)
    → (on success only, not awaited past its own .catch) sseHub.publish(projectId, "enrichment_completed", {...}) — Task 26, same Redis pub/sub channel the API process publishes to and subscribes from
```

`server.js` connects to MongoDB Atlas (`config/db.js`) before the app
starts listening, so nothing accepts traffic before Mongo is reachable.

The dashboard's read-side flow (project list, error group table,
detail view) is now covered above, added across Tasks 17-19.

## Deliberate Non-Choices (don't second-guess these later)

- No repository/DAO layer between services and Mongoose — unjustified
  indirection at this scope.
- **Previously a non-choice, now implemented (Task 25):** a BullMQ
  queue (Redis via Render's free Key Value tier) now sits between
  ingestion and AI enrichment, consumed by a separate `worker.js`
  process — this section used to say fire-and-forget dispatch was
  sufficient at MVP scale and a queue was a named future step; see
  `DECISIONS.md`'s "Task 25" entry for why that step was taken.
- No 4-layer AI provider abstraction — `aiService` is pure functions
  (except `callGemini`, a thin SDK wrapper). Confirmed in Task 11:
  `@google/genai` (current unified SDK, not the deprecated
  `@google/generative-ai`), model `gemini-2.5-flash`.
- ~~No `AppError`/`catchAsync` yet~~ — shipped in Task 20 (20.1 added
  `utils/AppError.js`/`utils/catchAsync.js`/
  `middleware/errorMiddleware.js`; 20.2 adopted them across
  controllers, see `DECISIONS.md`). Plain try/catch was the deliberate
  standard only up through Task 19; no longer the pattern going
  forward.