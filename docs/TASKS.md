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

- [x] **Task 15** — React scaffold, AuthContext, axios instance with interceptor
- [x] **Task 16** — Login/Register pages, ProtectedRoute
- [x] **Task 17** — Dashboard + ProjectDetail pages (project list, error group table)
- [x] **Task 18** — Status update endpoint + UI

## Milestone 5: Detail View & Polish

- [x] **Task 19** — ErrorGroupDetail page (AI panel as checklist, event list, sparkline)
- [x] **Task 20** — Centralized error middleware (AppError + catchAsync) + validation pass
- [ ] **Task 21** — ~~Rate limiting (ingestion + login)~~ (pulled forward ahead of schedule — see `DECISIONS.md`'s "Rate limiting: login and ingestion" entry), payload size caps still remain
- [ ] **Task 22** — Cursor pagination on group list endpoint
- [x] **Task 23** — Dark theme, monospace tokens, table layout, "Simulate Error" demo button

## Milestone 6: Reliability & Real-Time Infrastructure

Foundational — later milestones build on this one. See `DECISIONS.md`'s
"Scope expansion: Milestones 6-9" entry for the full ordering
rationale, and its "Scope expansion — revision after deeper review"
addendum for the technical findings behind the specifics below (this
milestone's task descriptions were substantially corrected after a
shallow first pass missed real issues — see that addendum for what
changed and why).

- [x] **Task 25** — Background job queue: BullMQ + Render Key Value (Redis-compatible, free tier), consumed by a **separate** `server/worker.js` process (its own Render Background Worker service, not folded into the API process). Migrates AI enrichment off its current unawaited fire-and-forget call onto this queue, with retry/backoff. Sub-parts:
  - [x] 25.1 — Render Key Value connection config (`config/redis.js`), local dev instructions (run Redis locally or point at a dev Render Key Value instance)
  - [x] 25.2 — BullMQ queue + job producer (`services/enrichmentQueue.js`), `errorGroupService`'s new-group path enqueues instead of calling `enrichErrorGroup` directly
  - [x] 25.3 — `server/worker.js` — separate process, own `package.json` start script, consumes the queue and calls the existing `enrichErrorGroup`/`aiService` code unchanged
  - [x] 25.4 — Retry/backoff policy + failed-job visibility (BullMQ's built-in retry, exponential backoff; failed jobs stay queryable, not silently dropped)
  - [x] 25.5 — Manual test (kill the worker mid-queue, confirm jobs wait and resume) + docs + commit. **The underlying mechanism is thoroughly verified** — real Redis, real BullMQ Queue/Worker, the real `enqueueEnrichment` producer, and the real `enrichErrorGroup` (see `DECISIONS.md`'s "Task 25" entry for the two integration checks run), which is why this is checked. One smaller gap, for transparency: the checks used a stand-in script reproducing `worker.js`'s processing logic rather than literally executing `worker.js` itself as a process (it calls `connectDB()`/`start()` immediately at load, unsafe to run against real Mongo Atlas from a sandbox) — running `npm run worker:dev` yourself at least once is still worth doing to confirm the actual file starts cleanly.
- [ ] **Task 26** — Real-time push to dashboard via Server-Sent Events. **Four real issues were found via manual browser testing after initial implementation, all now fixed — see 26.5 and `DECISIONS.md` for the full sequence.** **Auth note (see addendum):** native `EventSource` cannot send an `Authorization` header, and this app's `morgan` logging means a JWT-in-query-string would land in plaintext server logs — so auth is a short-lived, single-use SSE ticket, not the JWT directly. Sub-parts:
  - [x] 26.1 — `POST /api/projects/:id/sse-ticket` (JWT-authed, ownership-scoped) mints a random ticket, stored in Redis with a 30s TTL, one-time use
  - [x] 26.2 — `GET /api/sse/stream?ticket=...` — validates + burns the ticket (atomic `GETDEL`), holds the SSE connection open, heartbeats every 20s
  - [x] 26.3 — Server-side emit points: new error group created, group status changed, enrichment job completed (from `worker.js`) — all three publish to one Redis pub/sub channel (`services/sseHub.js`), fanned out in-process via a plain Node `EventEmitter` (not one Redis subscriber connection per SSE client — see `DECISIONS.md`'s "Task 26" entry for the connection-cap reasoning)
  - [x] 26.4 — Client: `EventSource` consumer (`hooks/useProjectSSE.js`) in `ProjectDetailPage`/`GroupDetailPage`, reconnect-on-drop handling (closes the dying connection and re-mints a fresh ticket rather than letting native auto-reconnect retry a dead one), plus a small "live" indicator
  - [ ] 26.5 — Manual test (two browser tabs, confirm live push) + docs + commit. **History:** first checked off on too narrow a basis (a Node-script-level check, no real browser), corrected back to unchecked. User then ran the real two-tabs test four times, each time reporting exactly what did and didn't work: (1) found the live indicator and all updates broken — root cause was the Redis connection hanging forever when unreachable, fixed; (2) still broken after Redis was confirmed reachable — root cause was a genuinely missing route registration for `POST /:id/sse-ticket`, fixed; (3) status changes and new-group creation confirmed syncing live for real, but duplicate/count-bump events (an existing group hit again) never synced — a deliberately-scoped-out case from Task 26's original design, now built (`duplicate_recorded` event type); (4) counts now syncing correctly, but every click appeared to "reload the page" — root cause was `handleSimulate` calling `fetchData()` without the `silent` flag, blanking the whole page down to a loading line on every click (a pure rendering bug, no actual navigation ever occurred), fixed. **Still needs:** the user's own final confirmation that a clean two-tab test — new group, duplicate/count-bump, status change, all updating in place with no visual flash — now passes end to end before this is checked off for real.
- [ ] **Task 27** — Per-API-key ingestion rate limiting (current limiter in `middleware/rateLimiter.js` is per-IP only — a shared IP with one noisy key throttles every other key on it)

## Milestone 7: Alerting & Insights

- [ ] **Task 28** — Alert delivery infra (Resend, dispatched as a queue job via Task 25's infra for retry) + per-project alert config (which email, which triggers enabled) + new-group / severity-threshold triggers
- [ ] **Task 29** — Trend/spike detection. **Concrete algorithm (see addendum for why this needed specifying up front):** for each error group, compare the current hour's event count against the trailing 24-hour average hourly rate (excluding the current, in-progress hour). Flag as a spike when the current rate exceeds the baseline by a configurable multiplier (default 3x) **and** the current hour's absolute count is above a minimum floor (default 5) — the floor exists so a group going from 1 event/hour to 3 doesn't register as a "3x spike" on noise. Groups with under 24 hours of history have no baseline yet and are never flagged as spiking (reported as "insufficient history," not silently treated as 0). Sub-parts:
  - [ ] 29.1 — Baseline calculation service (`services/trendService.js`), pure function over `ErrorEvent` timestamps, unit-testable in isolation
  - [ ] 29.2 — Wire into `GroupDetailPage`'s existing sparkline area (surface current-vs-baseline, not just raw counts)
  - [ ] 29.3 — Manual test with `Simulate Error` fired in a tight loop to actually trigger the threshold + docs + commit
- [ ] **Task 30** — Spike-triggered alerts (extends Task 28's delivery infra with Task 29's detection as a second trigger type)
- [ ] **Task 31** — Multi-environment / release tagging. **Additive, not overlapping** (see addendum): `ErrorEvent.env` already exists but is explicitly documented as "accepted but unused" — this task both finally uses `env` meaningfully and adds a new, distinct `release` field (e.g. `"v1.4.2"`) alongside it; `env` answers "which deployment" (staging/production), `release` answers "which build." Surfaces "introduced in v1.4.2" on the group detail page.
- [ ] **Task 32** — Source-map support. **Scope boundary (see addendum):** resolves minified stack frames to original source **for display only** on the group detail page — does **not** change fingerprinting/dedup, which keeps hashing the raw frames exactly as it does today; changing what dedup hashes on is a separate, riskier decision this task explicitly does not make. Reuses `utils/stackNormalizer.js`'s existing `parseStackFrames` structured output rather than re-parsing stacks. **Demo note:** the existing `demo-app` throws real, non-minified Node stack traces, so it won't exercise this feature on its own — a small hand-crafted minified-JS-plus-`.map` example is needed alongside it for the demo/manual test.

## Milestone 8: Product Polish & Growth

- [ ] **Task 33** — Search/filter + saved views on the error group table
- [ ] **Task 34** — SDK snippet generator (per-project copyable onboarding snippet on the dashboard, reduces "how do I even send it an error" friction)
- [ ] **Task 35** — Public API reference page (rendered from `API.md`, not hand-duplicated)
- [ ] **Task 36** — UI redesign pass 2 — dashboard overview page (trend charts, alert status, release timeline), refined visual system building on Task 23's token set. Deliberately last among feature work so it reflects the final feature surface (alerts, releases, trends) instead of being redone twice.

## Milestone 9: Ship

- [ ] **Task 37** — README, screenshots/GIF, deploy (Vercel + Render web service + Render Background Worker + Render Key Value + Atlas) — renumbered from the original Task 24; unchanged in substance, just resequenced to the end now that Milestones 6-8 exist

## Notes

- Each task's definition of done includes: implementation, manual test,
  docs updated, commit made.
- Do not batch tasks even if they feel small — one task, one stop, one
  confirmation.
- Milestones 6-9 are a deliberate scope expansion agreed on after
  Task 23, before starting the original Task 24. See `DECISIONS.md`'s
  "Scope expansion: Milestones 6-9" entry for the reasoning and the
  alternatives considered.

## Open Infra Decisions (resolve at the start of the task named)

- **Task 25:** BullMQ + **Render Key Value** (Render's own Redis-compatible free tier — revised from an earlier Upstash recommendation after checking Render's actual pricing page; same platform as the planned deploy, private networking, no third-party account). Worker runs as a **separate process** (`worker.js`), its own free Render Background Worker service — not folded into the API process, so queue processing doesn't compete with request handling on a free instance.
- **Task 26:** SSE, not Socket.io (Faultline only needs server→client push). Auth via a short-lived, single-use ticket minted over the existing JWT-authed pattern — **not** the JWT itself in the query string, because native `EventSource` can't send headers and this app's `morgan` request logging would otherwise write the raw JWT to server logs in plaintext.
- **Task 28:** Resend, not Nodemailer/Gmail SMTP (chosen for free-tier reliability over a resume demo's lifetime; Gmail SMTP is a known flakiness trap for exactly this use case).
- **Task 32:** Source-map resolution is display-only — it does not change what `fingerprintService` hashes for dedup. Changing fingerprinting to use resolved positions would plausibly produce *more* stable cross-release grouping, but it's a separate, riskier decision (affects dedup for every future event) intentionally deferred, not folded into this task.

## Deferred / Follow-Up Items

Cross-session backlog — not part of the milestone checklist, not tied
to task order. Remove an item only when it's actually resolved.

- **Atlas dev-cluster password rotation** — pending since Task 2.1,
  carried across multiple sessions.
- **`extractErrorType()` generic-bucket limitation** — non-conventional
  error names fall into a generic `"Error"` bucket. Documented
  limitation, not a bug. See DECISIONS.md's fingerprint-composition
  entry.