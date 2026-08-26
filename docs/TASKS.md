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
- [x] **Task 26** — Real-time push to dashboard via Server-Sent Events. **Four real issues were found via manual browser testing after initial implementation, all fixed and confirmed — see 26.5 and `DECISIONS.md` for the full sequence.** **Auth note (see addendum):** native `EventSource` cannot send an `Authorization` header, and this app's `morgan` logging means a JWT-in-query-string would land in plaintext server logs — so auth is a short-lived, single-use SSE ticket, not the JWT directly. Sub-parts:
  - [x] 26.1 — `POST /api/projects/:id/sse-ticket` (JWT-authed, ownership-scoped) mints a random ticket, stored in Redis with a 30s TTL, one-time use
  - [x] 26.2 — `GET /api/sse/stream?ticket=...` — validates + burns the ticket (atomic `GETDEL`), holds the SSE connection open, heartbeats every 20s
  - [x] 26.3 — Server-side emit points: new error group created, group status changed, enrichment job completed (from `worker.js`) — all three publish to one Redis pub/sub channel (`services/sseHub.js`), fanned out in-process via a plain Node `EventEmitter` (not one Redis subscriber connection per SSE client — see `DECISIONS.md`'s "Task 26" entry for the connection-cap reasoning)
  - [x] 26.4 — Client: `EventSource` consumer (`hooks/useProjectSSE.js`) in `ProjectDetailPage`/`GroupDetailPage`, reconnect-on-drop handling (closes the dying connection and re-mints a fresh ticket rather than letting native auto-reconnect retry a dead one), plus a small "live" indicator
  - [x] 26.5 — Manual test (two browser tabs, confirm live push) + docs + commit. **History:** first checked off on too narrow a basis (a Node-script-level check, no real browser), corrected back to unchecked. User then ran the real two-tabs test five times total, each time reporting exactly what did and didn't work: (1) found the live indicator and all updates broken — root cause was the Redis connection hanging forever when unreachable, fixed; (2) still broken after Redis was confirmed reachable — root cause was a genuinely missing route registration for `POST /:id/sse-ticket`, fixed; (3) status changes and new-group creation confirmed syncing live for real, but duplicate/count-bump events (an existing group hit again) never synced — a deliberately-scoped-out case from Task 26's original design, now built (`duplicate_recorded` event type); (4) counts now syncing correctly, but every click appeared to "reload the page" — root cause was `handleSimulate` calling `fetchData()` without the `silent` flag, blanking the whole page down to a loading line on every click (a pure rendering bug, no actual navigation ever occurred), fixed; (5) **confirmed clean** — new group, duplicate/count-bump, and status change all update live in both tabs with no visual flash. Genuinely done.
- [x] **Task 27** — Per-API-key ingestion rate limiting (current limiter in `middleware/rateLimiter.js` is per-IP only — a shared IP with one noisy key throttles every other key on it). Verified with a real functional test: two projects sharing an IP get fully independent buckets. Related, deliberately out-of-scope finding: invalid-API-key traffic still bypasses this limiter entirely (rejected by `apiKeyMiddleware` before reaching it) — a separate, coarser IP-based layer would be needed for that, not built here. See `DECISIONS.md`'s "Task 27" entry.

## Milestone 7: Alerting & Insights

- [x] **Task 28** — Alert delivery infra (Resend, dispatched as a queue job via Task 25's infra for retry) + per-project alert config (which email, which triggers enabled) + new-group / severity-threshold triggers. **All three sub-parts fully verified live** — see 28.1/28.2/28.3 below and `DECISIONS.md`'s "Task 28" entry for the full debugging trail that got 28.3 to a conclusive result. Sub-parts:
  - [x] 28.1 — Alert config schema (`Project.alertConfig`: email, newGroup, severityThreshold.{enabled, minSeverity}) + `GET`/`PATCH /api/projects/:id/alerts`, ownership-scoped, partial-update semantics matching `updateProject`. Manually confirmed via real HTTP round-trip (login → JWT → GET returned correct defaults).
  - [x] 28.2 — `services/alertService.js` (Resend wrapper, HTML-escaped) + `services/alertQueue.js` (BullMQ producer, mirrors `enrichmentQueue.js`) + consumer wired into `worker.js` as a second `Worker` instance on the `alerts` queue. **Fully verified manually**: real `.env` Resend sandbox key, `npm run worker` showing both queues listening, a manually-enqueued job completing in the worker log, and a real email arriving in a real inbox.
  - [x] 28.3 — Trigger wiring: `ingestController.js` and `projectController.simulateError` enqueue a new-group alert when `alertConfig.newGroup` is set; `worker.js`'s `processEnrichmentJob` re-fetches the freshly-enriched `ErrorGroup` after `enrichErrorGroup` completes and enqueues a severity-threshold alert when `aiSummary.severity` clears the project's configured `minSeverity`. **Now fully confirmed live**, both trigger paths: new-group alert fires and delivers on real ingestion; severity-threshold alert fires and delivers after real AI enrichment, with the severity/minSeverity comparison confirmed correct via temporary debug logging (`severity=high minSeverity=low comparison=true` → job enqueued → completed → email delivered), then the debug logging was removed before considering this done. Three real environmental issues were found and resolved along the way, none of them defects in the 28.3 code itself — see `DECISIONS.md` for the full sequence: (1) a stale, pre-28.3 `worker.js` process that was never restarted after the code was updated, producing an `aiSummary` with no chance of the new trigger logic ever having run against it; (2) fingerprint-dedup collisions from reusing an identical stack trace string across manual test calls, which this codebase fingerprints on (type + normalized stack), not the message text, so a changing message with a fixed stack still deduped to the same `ErrorGroup`; (3) two `worker.js` processes running simultaneously against the same Redis/queues, so the terminal being watched wasn't necessarily the one processing a given job.
- [x] **Task 29** — Trend/spike detection. **Concrete algorithm (see addendum for why this needed specifying up front):** for each error group, compare the current hour's event count against the trailing 24-hour average hourly rate (excluding the current, in-progress hour). Flag as a spike when the current rate exceeds the baseline by a configurable multiplier (default 3x) **and** the current hour's absolute count is above a minimum floor (default 5) — the floor exists so a group going from 1 event/hour to 3 doesn't register as a "3x spike" on noise. Groups with under 24 hours of history have no baseline yet and are never flagged as spiking (reported as "insufficient history," not silently treated as 0). Sub-parts:
  - [x] 29.1 — Baseline calculation service (`services/trendService.js`), pure function over `ErrorEvent` timestamps, unit-testable in isolation
  - [x] 29.2 — Wire into `GroupDetailPage`'s existing sparkline area (surface current-vs-baseline, not just raw counts)
  - [x] 29.3 — Manual test with `Simulate Error` fired in a tight loop to actually trigger the threshold + docs + commit. **Confirmed live**: trend badge on `GroupDetailPage` flipped from non-spiking to "spiking" after a tight loop of Simulate Error clicks landed enough hits on one group within the current hour.
- [x] **Task 30** — Spike-triggered alerts (extends Task 28's delivery infra with Task 29's detection as a second trigger type). **Confirmed live**: after enabling `alertConfig.spikeDetection` and firing a spaced-out burst of `Simulate Error` clicks, a real `[Faultline] Spike detected in ...` email arrived. A real bug was found and fixed along the way — see the addendum and `DECISIONS.md`'s "Task 30" entry.
- [x] **Task 31** — Multi-environment / release tagging. **Additive, not overlapping** (see addendum): `ErrorEvent.env` already exists but is explicitly documented as "accepted but unused" — this task both finally uses `env` meaningfully and adds a new, distinct `release` field (e.g. `"v1.4.2"`) alongside it; `env` answers "which deployment" (staging/production), `release` answers "which build." Surfaces "introduced in v1.4.2" on the group detail page.
- [x] **Task 32** — Source-map support. **Scope boundary (see addendum):** resolves minified stack frames to original source **for display only** on the group detail page — does **not** change fingerprinting/dedup, which keeps hashing the raw frames exactly as it does today; changing what dedup hashes on is a separate, riskier decision this task explicitly does not make. Reuses `utils/stackNormalizer.js`'s existing `parseStackFrames` structured output rather than re-parsing stacks. **Demo note:** the existing `demo-app` throws real, non-minified Node stack traces, so it won't exercise this feature on its own — a small hand-crafted minified-JS-plus-`.map` example is needed alongside it for the demo/manual test. **Follow-up (post-Task 41):** upload/list/delete were API-only for a while (build tools were assumed to be the only caller) — a client UI (`components/project-detail/SourceMapManager.jsx`, a drawer on `ProjectDetailPage` matching the SDK snippet generator's pattern) was added afterward, live-verified against the real API (upload, list, delete, both client-side and server-side validation error paths all confirmed).

## Milestone 8: Product Polish & Growth

- [x] **Task 33** — Search/filter + saved views on the error group table
- [x] **Task 34** — SDK snippet generator (per-project copyable onboarding snippet on the dashboard, reduces "how do I even send it an error" friction)
- [x] **Task 35** — Public API reference page (rendered from `API.md`, not hand-duplicated)
- [x] **Task 36** — UI redesign pass 2 — dashboard overview page (trend charts, alert status, release timeline), refined visual system building on Task 23's token set. Deliberately last among feature work so it reflects the final feature surface (alerts, releases, trends) instead of being redone twice. **Corrected after Task 37:** the first pass under this checkbox (commit `bbbcdca`) only shipped a metrics/stat-card grid, with "System Status"/"Worker Queue" as hardcoded display strings — it did not actually build the trend chart, alert status, or release timeline this line promises. A follow-up pass added `GET /api/projects/overview` (hourly trend series, alert-config + isSpiking summary, recent release-tagged groups) and the three dashboard widgets that read it. See `DECISIONS.md`'s "Task 36 — overview widgets" entry.

## Milestone 9: Ship

- [x] **Task 37** — README, screenshots/GIF, deploy (Vercel + Render web service + Render Background Worker + Render Key Value + Atlas) — renumbered from the original Task 24; unchanged in substance, just resequenced to the end now that Milestones 6-8 exist

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

## Milestone 10: Performance & Packaging

- [ ] **Task 38** — k6 load test on ingestion path. Phase 1
  (ingestion-only, thresholds 1-4) run for real and passing — see
  `PERFORMANCE.md` and `DECISIONS.md`'s "Task 38: ingestion latency
  thresholds." Parent left unchecked: 38.3 (real queue-wait
  instrumentation) was never actually built, and 38.6's commit is
  outstanding.
  - [x] 38.1 — Install k6, write baseline script hitting
    `POST /api/events` with a realistic payload (real API key, varied
    `message`/`stack` to avoid all-hits-one-fingerprint skew — see
    Task 28's fingerprint-collision lesson, don't repeat it here).
  - [x] 38.2 — Define six thresholds up front, before tuning anything:
    e.g. `http_req_duration{p95}<Xms`, `http_req_failed<1%`,
    `iteration_duration{p95}<Yms`, a custom queue-wait-time metric,
    a custom worker-throughput metric, `checks{rate}>99%`. Pick
    numbers you believe are achievable, not aspirational — revise
    after the first real run.
  - [ ] 38.3 — Instrument queue wait time: timestamp on enqueue
    (`enrichmentQueue.js`) vs job-start in `worker.js`, exposed via a
    custom k6 metric. **Not built.** The `enrichment_latency_ms`
    metric that exists instead times the full ingestion-response-to-
    aiSummary-visible span (queue wait + Gemini call + DB write + k6
    poll granularity, measured over HTTP by polling
    `GET /api/groups/:id`) — a reasonable, honestly-labeled proxy (see
    the rename in `ingest.js`'s comments), but not what this sub-task
    actually specifies: a true enqueue-vs-job-start delta requires
    `worker.js` to record and expose its own internal timestamps,
    which k6 can't observe over HTTP without new instrumentation. Left
    unchecked rather than counted as done under a different metric.
  - [x] 38.4 — Run at 50 VUs, capture actual numbers, iterate: tune
    (connection pool, worker concurrency, `ingestLimiter` ceiling) or
    lower the threshold to an honest number — never manufacture a
    number against an artificially generous limiter setting. Ran
    three times against the real Atlas-backed dev environment: default
    pool (failed), tuned pool (`maxPoolSize: 150` — no improvement,
    ruling out client-side contention), then thresholds lowered to the
    tuned run's real p95/p99 + ~15% headroom. See `DECISIONS.md`.
  - [x] 38.5 — Save the passing run's summary JSON + writeup in
    `docs/PERFORMANCE.md` (new file) — this is where the resume
    bullet's numbers come from, keep raw output for defensibility.
    Summary at `server/loadtest/last-run-summary.json`.
  - [ ] 38.6 — Commit script under `server/loadtest/`, docs + commit.
    Script/docs are on disk and finalized; the actual commit is
    outstanding (Git operations are being done by the project owner
    directly, not automated in this pass).

- [ ] **Task 39** — Docker Compose, full stack. Written but not yet
  verified end-to-end — see 39.5/39.6 below; this environment has no
  Docker daemon available to run that verification, so it needs to
  happen on a real machine before this checkbox can move.
  - [x] 39.1 — `Dockerfile` for API (`server/`), multi-stage build,
    non-root user.
  - [x] 39.2 — `Dockerfile` for worker (`server/worker.js` entrypoint,
    shares base image/layer with API, different `CMD`).
  - [x] 39.3 — `Dockerfile` for client (`client/`) — decide separate
    container vs folding into Nginx directly, record the decision in
    `DECISIONS.md`.
  - [x] 39.4 — `docker-compose.yml`: api, worker, client, redis, mongo,
    networked, env vars from `.env` (not committed), healthchecks on
    api/redis/mongo so `worker` doesn't start against a not-yet-ready
    Redis.
  - [ ] 39.5 — Verify `docker compose up` from a clean clone works
    end-to-end: register, create project, ingest via containerized
    demo-app, confirm dashboard shows it. Real test, same standard as
    Task 25.5/26.5 — a compose file that builds but was never run
    doesn't count as done.
  - [ ] 39.6 — Re-run Task 38's k6 script once against the
    containerized stack, note any delta vs the dev-environment
    baseline in `PERFORMANCE.md` (one paragraph, not a new task).
  - [x] 39.7 — Update `README.md` to lead with `docker compose up` as
    the fast path, keep manual multi-process instructions as
    alternate. Docs + commit.

## Milestone 11: Deployment Intelligence & Incidents

- [x] **Task 40** — Deployment correlation. **Confirmed live** against
  a real webhook POST, a real MongoDB Atlas connection, and real
  ingested events — see 40.6 below for the full trace and the one
  disclosed shortcut (the correlation job's real ~15-minute delay was
  not waited out live).
  - [x] 40.1 — `Deployment` model (project ref, sha, ref/branch,
    deployedAt, source: "github-webhook" | "manual"). Index on
    `(projectId, deployedAt)`. See `server/models/Deployment.js` and
    `DATABASE.md`.
  - [x] 40.2 — GitHub deployment webhook receiver
    (`POST /api/webhooks/github/:projectId`, signature-verified via
    `GITHUB_WEBHOOK_SECRET`, listens for `deployment_status: success`)
    that writes a `Deployment` row. **Order of checks** implemented as
    specified: signature verified first, then `Project.findById` +
    404. See `server/controllers/webhookController.js`.
  - [x] 40.3 — `services/deploymentCorrelationService.js`: pure
    before/after rate calculation (15min windows by default), unit
    tested in isolation (`server/tests/deploymentCorrelationService.test.js`,
    8 cases). The actual `ErrorEvent` query lives in
    `services/deploymentService.js`'s `correlateDeployment`, run from
    a **delayed** BullMQ job (`services/deploymentCorrelationQueue.js`)
    rather than inline — the after-window genuinely can't be measured
    before it elapses. Added a `minCountFloor` (5, same value as Task
    29's spike floor) beyond the task's literal text — see
    `DECISIONS.md`, "Task 40: regression floor" for why (without it, 0
    before-events + 1 after-event registers as an infinite-multiplier
    false positive).
  - [x] 40.4 — Threshold + flag: `regressionSuspected` when after-rate
    exceeds before-rate by a configurable multiplier (default 3x,
    matches Task 29's spike multiplier). Computed before/after numbers
    stored on the `Deployment` doc (`correlation.*` fields), never
    recomputed on read.
  - [x] 40.5 — `GET /api/projects/:id/deployments` (ownership-scoped,
    Task 22's cursor pagination style — same pattern, locally
    duplicated rather than shared, see `deploymentService.js`'s own
    comment on that restraint) + deployment timeline strip on the
    dashboard overview (`overviewService.js`'s new `deployments.recent`,
    rendered in `DashboardPage.jsx`).
  - [x] 40.6 — Manual test, run for real against this project's actual
    MongoDB Atlas connection (API + worker running locally, not
    Dockerized):
    1. Registered a throwaway test user/project, real signup/login/
       project-creation flow.
    2. Ingested 2 "before" events via real `POST /api/events` (API-key
       auth, the real ingestion path — not the dashboard's canned
       "Simulate Error" button the task text names; functionally
       equivalent, same `recordEvent` pipeline underneath, chosen
       because it let precise before/after counts be controlled).
    3. Sent a **hand-crafted** `deployment_status: success` webhook
       payload (not a real deploying repo — stated plainly, same
       honesty pattern as Task 23's demo-app caveat) with a real
       HMAC-SHA256 signature computed against `GITHUB_WEBHOOK_SECRET`,
       via `POST /api/webhooks/github/:projectId`. Confirmed a real
       `Deployment` row was created (`201`, real Mongo `_id` returned).
       Also confirmed the negative paths live: wrong signature → `401`;
       unknown `:projectId` → `404`; a `deployment_status.state`
       other than `"success"` → `200`, acknowledged but not recorded.
    4. Burst-fired 8 "after" events via the same real ingestion path
       immediately following the webhook.
    5. `GET /api/projects/:id/deployments` confirmed `correlation.status:
       "pending"` at this point — correct, since the real BullMQ job
       was enqueued with a ~15-minute delay and that time hadn't
       elapsed. **Disclosed shortcut:** rather than waiting 15 real
       minutes for the queued job, `deploymentService.correlateDeployment`
       was invoked directly (same function the worker calls, against
       the same real data already in Atlas) to verify the query +
       math + persistence without spending session time on a delay
       BullMQ's own `delay` option already guarantees works. Result:
       `beforeCount: 2, afterCount: 8, regressionSuspected: true` —
       matching the predicted math exactly (afterRate 0.533/min > 3 ×
       beforeRate 0.133/min = 0.4/min, and afterCount 8 clears the
       floor of 5).
    6. Re-fetched via `GET /api/projects/:id/deployments` and
       `GET /api/projects/overview` — confirmed the computed
       correlation persisted correctly and surfaces through both the
       detail listing and the dashboard's `deployments.recent`.
    7. Cleaned up all test data (project, groups, events, deployment,
       user) from the real Atlas database afterward.
    Not verified live: the full real-time BullMQ delay-then-process
    flow running at its natural ~15-minute pace end-to-end (step 5's
    direct-invocation approach substitutes for it — same reasoning
    Task 25.5 used for its own worker.js-as-a-process gap). Worth a
    real timed run at some point, not required to trust the logic
    itself, which was exercised against real data either way.

- [x] **Task 41** — Incident model. **Confirmed live** — real
  webhook-triggered regression, real Incident auto-creation, real
  status transitions, real two-tab SSE push. One disclosed gap: the
  AI-diagnosis job's live Gemini call could only be verified failing
  correctly (real quota exhaustion, an external constraint — see
  41.6), not succeeding. See `DECISIONS.md`'s "Task 41: Incident model
  — architecture summary" entry.
  - [x] 41.1 — `Incident` model: project ref, title, status
    (open/investigating/resolved), severity, triggeredBy (deployment
    ref | spike ref | manual), affectedGroups (ErrorGroup refs),
    timeline (array of {type, message, timestamp}), aiSummary. See
    `server/models/Incident.js` and `DATABASE.md`.
  - [x] 41.2 — Auto-creation trigger: Task 40's regression flag or
    Task 29's spike detection creates (or appends to an already-open)
    `Incident` — dedup keyed on project + open status within a fixed
    30-min window (see DECISIONS.md). Do not double-fire per event.
    `services/incidentService.js`'s `recordTrigger`, called from both
    `ingestController.js` (spike) and `deploymentService.js`
    (regression) — one shared function, not two copies. 10 unit tests
    covering create-vs-append, the open-status-only filter, and the
    dedup window boundary.
  - [x] 41.3 — AI diagnosis: on incident creation/update, call
    `aiService` with affected groups' summaries + triggering
    deployment's commit metadata (if any) for a one-paragraph
    hypothesis. Enqueue as a job (same rule as Task 13/25) — no
    synchronous Gemini calls in the request path. New
    `aiService.buildIncidentDiagnosisPrompt`/`callGeminiText`/
    `validateIncidentHypothesis` trio (deliberately separate from the
    ErrorGroup-enrichment one — see `aiService.js`'s header comment),
    consumed by a fourth BullMQ queue/worker pair
    (`incidentDiagnosisQueue.js`).
  - [x] 41.4 — `GET /api/projects/:id/incidents`,
    `GET /api/incidents/:id`, `PATCH /api/incidents/:id/status`
    (ownership-scoped, Task 18's pattern). Not cursor-paginated —
    Task 41.4's spec names only Task 18's ownership pattern, not Task
    22's cursor style; see `incidentService.listIncidents`'s comment.
  - [x] 41.5 — `IncidentDetailPage` (new route, `/incidents/:id`):
    timeline, affected groups, AI hypothesis, status control. Push
    create/update over existing SSE channel (Task 26) — no second
    real-time mechanism. Linked from a new "Incidents" section on
    `ProjectDetailPage`. **Bug found and fixed along the way:**
    `GroupDetailPage`/`ProjectDetailPage`'s own SSE handlers had
    silently regressed during an unrelated UI redesign commit and were
    dead code (wrong argument count, event names that don't exist,
    wrong return-value destructuring) — fixed to match the original,
    correct Task 26 design. See `DECISIONS.md`'s dedicated entry for
    the full diagnosis.
  - [x] 41.6 — Manual test, run for real against this project's actual
    MongoDB Atlas connection, real Redis, and two real browser tabs:
    1. Registered a throwaway user/project, ingested 2 real "before"
       events via the real ingestion path.
    2. Sent a real HMAC-signed `deployment_status: success` webhook
       (hand-crafted payload, not a real deploying repo — same
       honesty pattern as Task 40.6) via
       `POST /api/webhooks/github/:projectId`. Real `Deployment`
       document created.
    3. Burst-fired 8 real "after" events (each a distinct new
       `ErrorGroup`, randomized stack per event).
    4. Invoked `deploymentService.correlateDeployment` directly
       (same disclosed shortcut as Task 40.6 — bypassing the real
       ~15-minute BullMQ delay, not the correlation logic itself):
       `beforeCount: 2, afterCount: 8, regressionSuspected: true`.
    5. Confirmed via `GET /api/projects/:id/incidents` and
       `GET /api/incidents/:id`: a real `Incident` auto-created with
       the correct title ("Regression suspected after deployment
       d3ad0f1"), `triggeredBy: { type: 'deployment', refId: <the
       real Deployment's id> }`, `affectedGroupsCount: 8` (matching
       the 8 distinct after-window groups), and a `timeline` entry
       with the exact expected message text.
    6. `PATCH /api/incidents/:id/status` to `"investigating"`,
       confirmed via re-fetch: status updated, timeline correctly
       *appended* (2 entries, original preserved) not overwritten.
    7. **Dedup verified live, both directions:** a second real
       deployment + real burst (against the now-`investigating`
       incident) legitimately computed `regressionSuspected: false`
       (its own before-window absorbed the first burst — a test-
       timeline artifact of firing bursts seconds apart, not a bug)
       — confirmed via `GET /api/projects/:id/incidents` that no
       second incident was created either way. The "open-status-only"
       dedup rule itself (a non-open incident does NOT absorb a new
       trigger) is proven deterministically by the unit tests (41.2
       above), which is the more reliable check for a rule that's
       about exact status-string matching.
    8. **AI diagnosis — the one disclosed gap:** the diagnosis job was
       enqueued and picked up by the worker (confirmed via BullMQ's
       job-count API), built its prompt, and called the real Gemini
       API — which failed with a real `429 RESOURCE_EXHAUSTED` (daily
       free-tier quota, already exhausted by earlier Task 38
       load-testing sessions — see the `seedTestProjects.js` bug entry
       in DECISIONS.md for why). Retried per BullMQ's backoff, then
       failed terminally, leaving `Incident.aiSummary` correctly
       `null`. This is the real infrastructure behaving exactly as
       designed under a real external constraint — not a code bug —
       but it does mean a *successful* AI hypothesis was not observed
       live this session. `aiService.js`'s new prompt-building and
       response-validation functions (the parts of 41.3 that don't
       need network access) are covered by 4 dedicated unit tests
       instead (`server/tests/aiService.test.js`).
    9. **SSE push confirmed live, two real browser tabs:** opened the
       same incident in two independently-created tabs, changed status
       to `"resolved"` in one via the actual `<select>` control, and
       confirmed the *other*, untouched tab updated to show
       `"RESOLVED"` and all 3 timeline entries with no manual refresh
       — the live-push signal traveled real API → real Redis pub/sub
       (`sseHub.publish`) → real SSE stream → real second browser tab.
    10. Cleaned up all test data (2 deployments, ~17 groups/events, 1
        incident, 1 project, 1 user) from the real Atlas database
        afterward. Also found and fixed a real, separate bug during
        this test: `seedTestProjects.js`'s re-seed cleanup never
        cascaded to `ErrorGroup`/`ErrorEvent`, leaving ~6,560 orphaned
        groups and a multi-thousand-job stale Redis queue backlog from
        earlier Task 38 sessions — this was what had exhausted the
        real Gemini quota found in step 8. Diagnosed, fixed at the
        source, and the existing mess cleaned up (queue drained,
        orphaned Mongo docs deleted) — see DECISIONS.md.
    Docs updated (this file, `API.md`, `DATABASE.md`, `DECISIONS.md`,
    `STATUS.md`).

## Notes for Milestones 10-11

- Task 39.6 exists specifically so the k6 numbers in your resume/
  `PERFORMANCE.md` are the containerized numbers, not dev-only ones —
  don't skip it.
- Both Milestone 11 tasks are read-heavy on existing services
  (`trendService`, `enrichmentQueue`, `sseHub`, `githubService`) —
  extend or call into them, don't fork/duplicate.
- Incident dedup window (41.2) and webhook secret scope (40.2) are
  pre-decided — see `DECISIONS.md`, don't re-litigate mid-task.