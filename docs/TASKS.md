# Faultline — Task Checklist

Tasks are atomic (one git commit each), matching the roadmap in the
approved blueprint. Check off as completed; do not reorder or skip.

## Milestone 1: Backend Foundation

- [x] **Task 1** — Monorepo init & Express skeleton
- [ ] **Task 2** — MongoDB connection + User model
- [ ] **Task 3** — Register/login endpoints (bcrypt + JWT)
- [ ] **Task 4** — `authMiddleware` + protected route guard

## Milestone 2: Projects & Ingestion

- [ ] **Task 5** — Project model + CRUD + API key generation/hashing
- [ ] **Task 6** — `apiKeyMiddleware`
- [ ] **Task 7** — Ingestion endpoint skeleton (`POST /api/events`)
- [ ] **Task 8** — Stack normalizer + fingerprint service
- [ ] **Task 9** — ErrorGroup/ErrorEvent models + atomic upsert dedup logic
- [ ] **Task 10** — Demo Express app that throws sample errors; verify dedup manually

## Milestone 3: AI Enrichment

- [ ] **Task 11** — `aiService`: buildPrompt / callGemini / parseAndValidate
- [ ] **Task 12** — GitHub Contents API fetch (grounding)
- [ ] **Task 13** — Wire AI enrichment into "new group" path, fire-and-forget
- [ ] **Task 14** — Derived confidence score + affectedFile/affectedFunction fields

## Milestone 4: Frontend Foundation

- [ ] **Task 15** — React scaffold, AuthContext, axios instance with interceptor
- [ ] **Task 16** — Login/Register pages, ProtectedRoute
- [ ] **Task 17** — Dashboard + ProjectDetail pages (project list, error group table)
- [ ] **Task 18** — Status update endpoint + UI

## Milestone 5: Detail View & Polish

- [ ] **Task 19** — ErrorGroupDetail page (AI panel as checklist, event list, sparkline)
- [ ] **Task 20** — Centralized error middleware (AppError + catchAsync) + validation pass
- [ ] **Task 21** — Rate limiting (ingestion + login), payload size caps, githubRepo validation
- [ ] **Task 22** — Cursor pagination on group list endpoint
- [ ] **Task 23** — Dark theme, monospace tokens, table layout, "Simulate Error" demo button
- [ ] **Task 24** — README, screenshots/GIF, deploy (Vercel + Render + Atlas)

## Notes

- Each task's definition of done includes: implementation, manual test,
  docs updated, commit made.
- Do not batch tasks even if they feel small — one task, one stop, one
  confirmation.