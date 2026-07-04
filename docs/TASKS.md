# Faultline — Task Checklist

Tasks are atomic (one git commit each), matching the roadmap in the
approved blueprint. Check off as completed; do not reorder or skip.

## Milestone 1: Backend Foundation

- [x] **Task 1** — Monorepo init & Express skeleton
  - [x] 1.1 — Folder structure + `server/package.json` + `.env.example`
  - [x] 1.2 — `server/config/env.js` (env loader)
  - [x] 1.3 — `server/app.js` (helmet, cors, body cap, morgan, `/health`, 404, error stub)
  - [x] 1.4 — `server/server.js` (bootstrap, unhandled rejection guard)
  - [x] 1.5 — Manual test + git commit + docs correction
- [x] **Task 2** — MongoDB connection + User model
  - [x] 2.1 — `server/config/db.js` (Mongoose connection, wired into server.js)
  - [x] 2.2 — `server/models/User.js` schema
  - [x] 2.3 — Password hashing (pre-save bcrypt hook) + `comparePassword` method
  - [x] 2.4 — Manual test + `DATABASE.md` update + commit
- [x] **Task 3** — Register/login endpoints (bcrypt + JWT)
  - [x] 3.1 — `server/utils/generateToken.js` (JWT signing helper)
  - [x] 3.2 — `authService.register` + `authController.register` + route
  - [x] 3.3 — `authService.login` + `authController.login` + route
  - [x] 3.4 — Manual test + `API.md` update + commit
- [x] **Task 4** — `authMiddleware` + protected route guard
  - [x] 4.1 — `server/middleware/authMiddleware.js` (JWT verification, attaches `req.user`)
  - [x] 4.2 — Protected test route `GET /api/auth/me` + manual test (valid/missing/invalid/expired token)
  - [x] 4.3 — `API.md` update + commit

## Milestone 2: Projects & Ingestion

- [x] **Task 5** — Project model + CRUD + API key generation/hashing
- [x] **Task 6** — `apiKeyMiddleware`
- [x] **Task 7** — Ingestion endpoint skeleton (`POST /api/events`)
- [x] **Task 8** — Stack normalizer + fingerprint service
- [x] **Task 9** — ErrorGroup/ErrorEvent models + atomic upsert dedup logic
- [x] **Task 10** — Demo Express app that throws sample errors; verify dedup manually

## Milestone 3: AI Enrichment

- [x] **Task 11** — `aiService`: buildPrompt / callGemini / parseAndValidate
- [x] **Task 12** — GitHub Contents API fetch (grounding)
- [x] **Task 13** — Wire AI enrichment into "new group" path, fire-and-forget
- [x] **Task 14** — Derived confidence score + affectedFile/affectedFunction fields

## Milestone 4: Frontend Foundation

- [ ] **Task 15** — React scaffold, AuthContext, axios instance with interceptor, schedule first audit session after task completion
- [ ] **Task 16** — Login/Register pages, ProtectedRoute
- [ ] **Task 17** — Dashboard + ProjectDetail pages (project list, error group table)
- [ ] **Task 18** — Status update endpoint + UI

## Milestone 5: Detail View & Polish

- [ ] **Task 19** — ErrorGroupDetail page (AI panel as checklist, event list, sparkline)
- [ ] **Task 20** — Centralized error middleware (AppError + catchAsync) + validation pass
- [ ] **Task 21** — ~~Rate limiting (ingestion + login)~~ (pulled forward ahead of schedule — see `DECISIONS.md`'s "Rate limiting: login and ingestion" entry), payload size caps, githubRepo validation still remain
- [ ] **Task 22** — Cursor pagination on group list endpoint
- [ ] **Task 23** — Dark theme, monospace tokens, table layout, "Simulate Error" demo button
- [ ] **Task 24** — README, screenshots/GIF, deploy (Vercel + Render + Atlas)

## Notes

- Each task's definition of done includes: implementation, manual test,
  docs updated, commit made.
- Do not batch tasks even if they feel small — one task, one stop, one
  confirmation.

## Deferred / Follow-Up Items

Cross-session backlog — not part of the milestone checklist, not tied
to task order. Remove an item only when it's actually resolved.

- **Atlas dev-cluster password rotation** — pending since Task 2.1,
  carried across multiple sessions.
- **`extractErrorType()` generic-bucket limitation** — non-conventional
  error names fall into a generic `"Error"` bucket. Documented
  limitation, not a bug. See DECISIONS.md's fingerprint-composition
  entry.