# Faultline — Architecture

## Current Folder Structure (reflects actual repo state, not the plan)

```
faultline/
├── client/                 (placeholder — scaffolded in Task 15)
│   └── README.md
├── server/
│   ├── config/
│   │   ├── env.js           (centralized env var loader)
│   │   └── db.js             (Mongoose connection to Atlas)
│   ├── controllers/
│   │   └── authController.js (register, login, me)
│   ├── services/
│   │   └── authService.js    (register, login — business logic, no req/res)
│   ├── middleware/
│   │   └── authMiddleware.js (JWT verification, attaches req.user)
│   ├── routes/
│   │   └── authRoutes.js     (POST /register, POST /login, GET /me)
│   ├── models/
│   │   ├── Project.js        (ownerId ref User, name, apiKeyHash, githubRepo validated, timestamps)
│   │   └── User.js           (name, email unique, passwordHash w/ bcrypt hook)
│   ├── utils/
│   │   ├── apiKey.js         (generateApiKey, hashApiKey — SHA-256, not bcrypt)
│   │   └── generateToken.js  (JWT signing helper)
│   ├── app.js                 (Express app: middleware, /api/auth routes, health check, 404, error stub)
│   ├── server.js               (bootstrap: connects DB, starts listener, crash guards)
│   ├── package.json
│   ├── package-lock.json
│   └── .env.example
├── demo-app/                (placeholder — built in Task 10)
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

## Request Flow (current, through Milestone 1)

```
Client → app.js middleware chain (helmet → cors → json → morgan)
       → /health route
       → /api/auth/register  → authController.register → authService.register → User (bcrypt hook hashes password)
       → /api/auth/login     → authController.login    → authService.login    → User.comparePassword
       → /api/auth/me        → authMiddleware (verifies JWT, loads req.user) → authController.me
       → (no match) 404 handler
       → (thrown error) centralized error handler stub
```

`server.js` now connects to MongoDB Atlas (`config/db.js`) before the
app starts listening, so nothing accepts traffic before Mongo is
reachable.

Will be expanded with the full ingestion/dashboard flow diagrams as
those pieces are built in Milestone 2.

## Deliberate Non-Choices (don't second-guess these later)

- No repository/DAO layer between services and Mongoose — unjustified
  indirection at this scope.
- No queue/broker (BullMQ, Redis) for AI enrichment at MVP scale —
  fire-and-forget dispatch is sufficient; queue is a named future step.
- No 4-layer AI provider abstraction — `aiService` is pure functions.
- No `AppError`/`catchAsync` yet, even though `utils/` conventionally
  includes them (see Layering Convention above) — plain try/catch is
  used throughout Milestone 1 controllers by design; the refactor to
  `AppError`/`catchAsync` is explicitly Task 20, not retrofitted early.