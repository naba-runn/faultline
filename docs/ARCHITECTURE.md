# Faultline — Architecture

## Current Folder Structure (reflects actual repo state, not the plan)

```
faultline/
├── client/                 (placeholder — scaffolded in Task 15)
│   └── README.md
├── server/
│   ├── config/
│   │   └── env.js          (centralized env var loader)
│   ├── controllers/        (empty — first controller in Task 3)
│   ├── services/           (empty — first service in Task 3)
│   ├── middleware/         (empty — first middleware in Task 4)
│   ├── routes/             (empty — first routes in Task 3)
│   ├── models/             (empty — first model in Task 2)
│   ├── utils/               (empty)
│   ├── app.js               (Express app: middleware, health check, 404, error stub)
│   ├── server.js             (bootstrap: starts listener, unhandled rejection guard)
│   ├── package.json
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

## Request Flow (current, skeleton only)

```
Client → app.js middleware chain (helmet → cors → json → morgan)
       → /health route
       → (no match) 404 handler
       → (thrown error) centralized error handler stub
```

Will be expanded with the full ingestion/dashboard flow diagrams as
those pieces are built.

## Deliberate Non-Choices (don't second-guess these later)

- No repository/DAO layer between services and Mongoose — unjustified
  indirection at this scope.
- No queue/broker (BullMQ, Redis) for AI enrichment at MVP scale —
  fire-and-forget dispatch is sufficient; queue is a named future step.
- No 4-layer AI provider abstraction — `aiService` is pure functions.