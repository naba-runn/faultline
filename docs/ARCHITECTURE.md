# Faultline — Architecture

## Current Folder Structure (reflects actual repo state, not the plan)

```
faultline/
├── client/                 (Vite + React, Tasks 15-16)
│   ├── src/
│   │   ├── api/axios.js              (shared axios instance — request interceptor attaches JWT, response interceptor clears it on 401)
│   │   ├── context/AuthContext.jsx   (user/token/loading state, login/register/logout, bootstraps via GET /api/auth/me)
│   │   ├── components/ProtectedRoute.jsx (gates a route on AuthContext's isAuthenticated; redirects to /login)
│   │   ├── pages/LoginPage.jsx       (email/password form → AuthContext.login)
│   │   ├── pages/RegisterPage.jsx    (name/email/password form → AuthContext.register)
│   │   ├── pages/DashboardPage.jsx   (placeholder behind ProtectedRoute — real project list/error table in Task 17)
│   │   ├── App.jsx                  (react-router-dom routes: /login, /register, /dashboard)
│   │   └── main.jsx
│   └── README.md
├── server/
│   ├── config/
│   │   ├── env.js           (centralized env var loader)
│   │   └── db.js             (Mongoose connection to Atlas)
│   ├── controllers/
│   │   ├── authController.js    (register, login, me)
│   │   ├── projectController.js (createProject, listProjects, getProject, updateProject, deleteProject)
│   │   └── ingestController.js  (ingestEvent — validates, persists via errorGroupService, 202s)
│   ├── services/
│   │   ├── authService.js    (register, login — business logic, no req/res)
│   │   ├── projectService.js (create/list/get/update/delete — all ownership-scoped in the query itself)
│   │   ├── fingerprintService.js (generateFingerprint, extractErrorType — pure, combines stackNormalizer's signature + parsed error type into the Task 9 dedup key)
│   │   ├── errorGroupService.js  (recordEvent — atomic upsert dedup + ErrorEvent creation, Task 9.3; enrichErrorGroup — AI enrichment orchestration, Tasks 13/14)
│   │   ├── aiService.js          (buildPrompt/callGemini/parseAndValidate — pure except callGemini, Task 11)
│   │   └── githubService.js      (fetchCodeSnippet/extractSnippet — GitHub Contents API grounding, Task 12)
│   ├── middleware/
│   │   ├── authMiddleware.js    (JWT verification, attaches req.user)
│   │   ├── apiKeyMiddleware.js  (API-key verification, attaches req.project — hot ingestion path)
│   │   └── rateLimiter.js       (loginLimiter, ingestLimiter — express-rate-limit)
│   ├── routes/
│   │   ├── authRoutes.js     (POST /register, POST /login, GET /me)
│   │   ├── projectRoutes.js  (POST /, GET /, GET/PATCH/DELETE /:id — all authMiddleware-guarded)
│   │   └── ingestRoutes.js   (POST / — apiKeyMiddleware + ingestLimiter-guarded, mounted at /api/events)
│   ├── models/
│   │   ├── Project.js        (ownerId ref User, name, apiKeyHash unique-indexed, githubRepo validated, timestamps)
│   │   ├── ErrorGroup.js     (projectId + fingerprint compound-unique index — the dedup backbone; firstSeen/lastSeen instead of timestamps; embedded aiSummary)
│   │   ├── ErrorEvent.js     (errorGroupId ref, rawStack, env, metadata, receivedAt — one doc per occurrence, indexed for timeline queries)
│   │   └── User.js           (name, email unique, passwordHash w/ bcrypt hook)
│   ├── utils/
│   │   ├── apiKey.js           (generateApiKey, hashApiKey — SHA-256, not bcrypt)
│   │   ├── generateToken.js    (JWT signing helper)
│   │   ├── httpResponse.js     (sendSuccess/sendError — response-shaping only)
│   │   └── stackNormalizer.js  (parseStackFrames, normalizeStack — pure, used by fingerprintService and Task 14's affectedFile/affectedFunction derivation)
│   ├── tests/
│   │   └── errorGroupService.test.js  (recordEvent dedup/retry-once cases; enrichErrorGroup grounded/ungrounded/failure cases, Tasks 13/14)
│   ├── app.js                 (Express app: middleware, /api/auth + /api/projects + /api/events routes, health check, 404, error stub)
│   ├── server.js               (bootstrap: connects DB, starts listener, crash guards)
│   ├── package.json
│   ├── package-lock.json
│   └── .env.example
├── demo-app/                (Task 10 — throws sample errors at Faultline)
│   ├── package.json
│   ├── index.js
│   ├── .env.example
│   └── README.md
├── docs/                    (this folder — permanent project memory)
├── .gitignore
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

Confirmed in practice through Milestone 1: `authController` calls
`authService`, never `User` directly; `authService` never references
`req`/`res`. `authMiddleware` is the one exception to "controllers
don't touch models," which is expected — middleware sits outside the
route/controller/service chain and legitimately needs its own DB
lookup (loading the user for `req.user`).

## Request Flow (current, through Milestone 3)

```
Client → app.js middleware chain (helmet → cors → json → morgan)
       → /health route
       → /api/auth/register  → authController.register → authService.register → User (bcrypt hook hashes password)
       → /api/auth/login     → loginLimiter → authController.login → authService.login → User.comparePassword
       → /api/auth/me        → authMiddleware (verifies JWT, loads req.user) → authController.me
       → /api/projects (POST)                 → authMiddleware → projectController.createProject → projectService.createProject → Project (apiKeyHash persisted unique-indexed, raw key returned once)
       → /api/projects (GET)                  → authMiddleware → projectController.listProjects  → projectService.listProjects  → Project
       → /api/projects/:id (GET/PATCH/DELETE) → authMiddleware → projectController.{getProject,updateProject,deleteProject} → projectService.* → Project (ownership-scoped in the query itself)
       → /api/events (POST)  → apiKeyMiddleware (verifies API key hash, loads req.project) → ingestLimiter
                              → ingestController.ingestEvent → errorGroupService.recordEvent
                                  → fingerprintService.generateFingerprint (stackNormalizer under the hood)
                                  → atomic upsert on ErrorGroup { projectId, fingerprint } (retry-once on 11000)
                                  → ErrorEvent.create (per-occurrence record)
                                  → responds 202 { received, projectId, errorGroupId, isNewGroup }
                                  → (isNewGroup only, fire-and-forget, not awaited) errorGroupService.enrichErrorGroup
                                      → githubService.fetchCodeSnippet (only if project.githubRepo set)
                                      → aiService.buildPrompt → aiService.callGemini → aiService.parseAndValidate
                                      → ErrorGroup.findByIdAndUpdate: aiSummary { rootCause, severity, suggestedFix, confidence, affectedFile, affectedFunction } (or left null on any failure)
       → (no match) 404 handler
       → (thrown error) centralized error handler stub
```

`server.js` connects to MongoDB Atlas (`config/db.js`) before the app
starts listening, so nothing accepts traffic before Mongo is reachable.

Will be expanded with the dashboard's read-side flow (project list,
error group table, detail view) as Milestone 4 lands.

## Deliberate Non-Choices (don't second-guess these later)

- No repository/DAO layer between services and Mongoose — unjustified
  indirection at this scope.
- No queue/broker (BullMQ, Redis) for AI enrichment at MVP scale —
  fire-and-forget dispatch is sufficient; queue is a named future step.
- No 4-layer AI provider abstraction — `aiService` is pure functions
  (except `callGemini`, a thin SDK wrapper). Confirmed in Task 11:
  `@google/genai` (current unified SDK, not the deprecated
  `@google/generative-ai`), model `gemini-2.5-flash`.
- No `AppError`/`catchAsync` yet, even though `utils/` conventionally
  includes them (see Layering Convention above) — plain try/catch is
  used throughout Milestone 1 controllers by design; the refactor to
  `AppError`/`catchAsync` is explicitly Task 20, not retrofitted early.