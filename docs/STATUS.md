# Faultline — Status

> Single source of truth for "where are we, right now." Edited in
> place, never regenerated wholesale (see `PROJECT_RULES.md` §3 for
> why the old two-file `PROJECT_CONTEXT.md`/`HANDOFF.md` split was
> retired in favor of this one file). Read order for a new session:
> `PROJECT_RULES.md` → this file → `TASKS.md`.

## Current Milestone / Task

- **Milestone 1 — Backend Foundation:** COMPLETE (4/4 tasks)
- **Milestone 2 — Projects & Ingestion:** COMPLETE (6/6 tasks)
- **Milestone 3 — AI Enrichment:** COMPLETE (4/4 tasks)
- **Milestone 4 — Dashboard Auth & Core Pages:** COMPLETE (4/4 tasks)
- **Milestone 5 — Detail View & Polish:** IN PROGRESS (5/6 tasks — 19, 20, 21, 22, 23 done)
- **Milestone 6 — Reliability & Real-Time Infrastructure:** COMPLETE (3/3 tasks — 25, 26, 27 all done and confirmed)
- **Milestone 7 — Alerting & Insights:** IN PROGRESS (1/5 tasks — Task 28 done and fully verified live)
- **Milestone 8 — Product Polish & Growth:** NOT STARTED (0/4 tasks)
- **Milestone 9 — Ship:** NOT STARTED (0/1 task — original Task 24, renumbered to Task 37)

Milestones 6-9 are a scope expansion agreed on after Task 23, before
starting the original Task 24. Full reasoning, ordering rationale, and
alternatives considered: `DECISIONS.md`'s "Scope expansion: Milestones
6-9" entry.

Task numbering and full checklist: `TASKS.md`. This section only
states current position, not a restated description of every task —
that would duplicate `TASKS.md`.

## What's Actively In Progress

Nothing mid-implementation as of this pass. Most recently done:
**Task 28 — alert delivery infra, per-project config, and both
triggers — all three sub-parts fully verified live.** Three parts:

- **28.1 — alert config schema + CRUD.** `Project.alertConfig` (email,
  newGroup, severityThreshold.{enabled, minSeverity}), `GET`/`PATCH
  /api/projects/:id/alerts`. Confirmed via a real HTTP round trip
  (login → JWT → GET returned correct all-off defaults).
- **28.2 — delivery service + queue.** `services/alertService.js`
  (Resend wrapper, HTML-escapes user-controlled fields before they hit
  an email body), `services/alertQueue.js` (BullMQ producer, mirrors
  `enrichmentQueue.js`'s shape), consumer wired into `worker.js` as a
  second `Worker` instance on the `alerts` queue. Confirmed via a real
  Resend sandbox key, both queues listening, a manually-enqueued job
  completing, and a real email landing in a real inbox.
- **28.3 — trigger wiring.** `ingestController.js`/
  `projectController.simulateError` enqueue a new-group alert when
  `alertConfig.newGroup` is set. `worker.js`'s `processEnrichmentJob`
  re-fetches the `ErrorGroup` fresh after `enrichErrorGroup` completes
  (that function writes `aiSummary` via its own `findByIdAndUpdate`
  and doesn't mutate/return it) and enqueues a severity-threshold
  alert when the fresh `aiSummary.severity` clears the project's
  configured `minSeverity`. **Now fully confirmed live** — both
  trigger paths fired and delivered real emails against real
  ingestion + real AI enrichment.

**The path to confirming 28.3 live surfaced three real environmental
issues, worth recording since they'll likely recur in future manual
testing sessions — none of them were defects in the 28.3 code itself:**

1. A stale `worker.js` process, started before the 28.3 code existed,
   was never restarted after the file was updated — so enrichment
   completed and wrote `aiSummary` under old code with zero
   severity-threshold logic in it. Symptom: severity came back
   correctly, but no alert ever fired, no error either. Fix: actually
   restart the worker process after any code change to it — an
   obvious rule in hindsight, but easy to skip when nothing errors out
   to prompt it.
2. Fingerprint-deduplication collisions during manual testing.
   `fingerprintService.generateFingerprint` hashes error *type* +
   normalized *stack signature* (see `services/fingerprintService.js`)
   — not the raw message text. Varying only the `message` field
   between test `curl` calls while reusing an identical `stack` string
   produces the same fingerprint every time, so repeated "new" test
   errors kept deduping into the same, already-existing `ErrorGroup`
   (`isNewGroup: false`). Fix for future manual testing: vary the
   stack trace itself (e.g. the line number in the one stack frame),
   not just the message, to guarantee a fresh group.
3. Two `worker.js` processes running simultaneously against the same
   Redis instance and queues (one likely left over from an earlier
   `npm run worker:dev` session, the other a fresh `npm run worker`).
   BullMQ hands each job to whichever worker claims it first, so the
   terminal being watched wasn't necessarily the one that processed
   any given job — leading to real confusion about "nothing is
   happening" when in fact something was, just invisibly, in the other
   process. Fix: `ps aux | grep "node worker.js"` before any manual
   test session that depends on reading worker output, and kill
   duplicates first.

Full sequence, quotes, and reasoning for all three: `DECISIONS.md`'s
"Task 28" entry.

**Milestone 6 is now fully complete.** Task 26's live-update feature
was confirmed working end-to-end by the user's own two-tab test —
new group, duplicate/count-bump, and status change all updating live
with no visual flash — after four rounds of real bugs found and fixed
across earlier testing (the Redis connection hang, the missing route
registration, the missing `duplicate_recorded` event type, and the
non-silent-refetch rendering bug that looked like a page reload). Full
sequence in `DECISIONS.md`; `TASKS.md`'s Task 26/26.5 are checked off
for real, not on the strength of a narrower earlier check.

Before Task 27: **the actual resolution of the "page reload" symptom**
reported across several rounds of manual testing — it was never a
browser-level
reload. `ProjectDetailPage.jsx`'s `handleSimulate` called `fetchData()`
without the `silent` flag added back in Task 26, so every Simulate
Error click blanked the entire page (topbar, live indicator, table —
everything) down to a single "Loading project..." line before
redrawing — a pure React state change that looks exactly like a
reload but involves no navigation at all. One-line fix:
`fetchData()` → `fetchData(true)`. Also fixed in the same investigative
arc: two elements missing `id`/`name` attributes (the status `<select>`
and the AI-checklist `<input type="checkbox">`), which explained a
separate, unrelated Chrome DevTools Issues-tab report ("violating
node" × 34) that had initially looked connected to the reload mystery
but wasn't. Full story, including an honest account of why the
earlier investigation (Redis, routing, `window.location` searches) took
longer than the eventual one-line fix warranted, is in `DECISIONS.md`'s
"The actual page-reload mystery" entry.

Before this: **a third fix for the same live-update feature**, found via the user's own
detailed, precise manual testing — this time against the previous two
fixes already applied. Reported exactly: status changes sync live
correctly; a brand-new error group syncs live (with a short pause);
but simulating an error against an *already-existing* group (count
bump only) never synced without a manual refresh. **This one wasn't a
bug in the "broken code" sense — it was a deliberately-scoped-out 4th
case from the original Task 26 entry**, which explicitly said a
count-bump event would be a cheap follow-up if wanted later. Also
found in the same pass: `projectController.simulateError` never
published *any* live event at all, for either case — the new-group
case only appeared to sync because of an unrelated, delayed
`enrichment_completed` push a few seconds later, not a direct signal
from the button. Both are now fixed: a new `duplicate_recorded` event
type, published from both real ingestion and the Simulate Error
button; `simulateError` also now publishes `new_group` directly,
matching real ingestion's behavior exactly instead of relying on
incidental timing. Full story in `DECISIONS.md`'s "Duplicate events
never pushed a live update" entry.

Before this: **a second bug fix**, found after the Redis connection fix below turned
out to be real but not sufficient — the user confirmed Redis was
reachable and the live indicator/cross-tab updates still didn't work.
**Root cause: `server/routes/projectRoutes.js` was missing the line
that registers `POST /api/projects/:id/sse-ticket` entirely.** The
`mintSseTicket` function existed correctly in `projectController.js`,
but nothing routed to it — the request fell straight through to a
generic 404 before ever reaching real logic. Confirmed with an isolated
before/after routing test (auth stubbed out specifically, since the
real `authMiddleware` intercepts every request to `/api/projects/*`
regardless of whether a specific route matches, which made an earlier,
naive comparison give a false-identical result for both the broken and
fixed versions). Also found and fixed, lower severity:
`hooks/useProjectSSE.js` existed on disk as `UseProjectSse.js` —
different capitalization from what `ProjectDetailPage.jsx` imports;
content was identical, so not corruption, but this would definitely
break on Render's case-sensitive Linux deployment later regardless of
whether it was live-causing today's symptom. Full story in
`DECISIONS.md`'s "Bug fix #2" entry.

**This is the second independent bug found for the same reported
symptom in one debugging session** — a reminder that a real, necessary
fix isn't necessarily a complete one. **The actual two-browser-tabs
manual test is still owed, more importantly now, not less** — two
separate things have now been fixed without that final confirmation.

Before this: **a bug fix to Task 25/26's Redis connection handling, found via the user's
own manual browser testing.** Full story, in order:

1. Task 26 (real-time SSE updates) was implemented, then its manual
   test (26.5, "two browser tabs") was initially checked off on the
   strength of a narrower Node-script-level check (real Redis, real
   HTTP requests directly against `/api/sse/stream` — but bypassing
   the actual browser and React client entirely). That was too weak a
   basis to call the sub-task done and was corrected back to
   unchecked once this was pointed out.
2. The user then actually ran the real manual test: two browser tabs,
   logged in, watching the same project. **It didn't work** — no green
   "live" dot ever appeared, and updating a group's status in one tab
   never reflected in the other without a manual refresh.
3. Root cause found: `config/redis.js` had a single shared Redis
   connection configured with `maxRetriesPerRequest: null`. That
   setting is a hard **requirement for BullMQ** (Task 25's Queue/Worker
   — it throws at construction time without it) — but it also means
   any command on that connection **retries forever and never
   rejects** if Redis is unreachable. `mintSseTicket`'s `SET` and the
   SSE stream endpoint's `GETDEL` were mistakenly sharing that same
   connection, so when Redis wasn't reachable, minting a ticket didn't
   fail with an error — the HTTP request just hung forever, silently.
   That's exactly why the "live" indicator never turned on: the
   client's ticket-mint request never resolved or rejected, so neither
   the success path nor the catch-and-retry path in
   `useProjectSSE.js` ever ran.
4. **Fixed** by splitting into two connections: `getBullConnection()`
   (unchanged `maxRetriesPerRequest: null`, used only by BullMQ's
   Queue/Worker, which legitimately needs to retry forever) and
   `getRedisConnection()` (now bounded — 3 retries, a 3s connect
   timeout, fast backoff — used for ad-hoc commands like ticket
   SET/GETDEL and pub/sub PUBLISH, which should fail fast with a clear
   error instead of hanging an HTTP request indefinitely). Verified:
   with no Redis running, the ad-hoc connection now rejects in ~1.2s
   with a clear error instead of hanging forever; with Redis running,
   a full regression check confirmed BullMQ's own retry/backoff still
   works unchanged and ticket-mint completes normally. Full details in
   `DECISIONS.md`'s "Bug fix: ad-hoc Redis commands hung forever when
   Redis was unreachable" entry.

**This fix makes failures fail fast and visible — it does not remove
the need to actually have Redis running.** If you still don't have a
local Redis (or a real Render Key Value instance) running, ticket
minting will now fail quickly with a clear `500` error in the server
log and browser network tab, instead of hanging silently — check for
that error specifically as the next diagnostic step if the live
indicator still doesn't work after pulling this fix.

**Still owed, for real this time:** the actual two-browser-tabs manual
test, run against this fixed code, with a real local Redis (or Render
Key Value instance) actually running. See `TASKS.md`'s 26.5 for the
exact steps.

Before this bug fix: **Task 26 — real-time dashboard updates via
Server-Sent Events.** Three event types (`new_group`, `status_changed`,
`enrichment_completed`) push live to the dashboard. Auth uses a
short-lived (30s), single-use ticket
(`POST /api/projects/:id/sse-ticket`, JWT-authed) rather than a JWT
directly in the stream URL — native `EventSource` can't send an
`Authorization` header, and this app's `morgan` logging would
otherwise write a JWT to server logs in plaintext. All three emit
points (including `worker.js`, a separate process with no HTTP
connections of its own) publish to one Redis pub/sub channel
(`services/sseHub.js`), fanned out in-process via a plain Node
`EventEmitter` — deliberately ONE shared Redis subscriber connection
for the whole API process, not one per SSE client, since Render's free
Key Value tier has a real connection cap. Client reconnect handling
explicitly closes a dropped connection and mints a fresh ticket rather
than trusting `EventSource`'s native auto-reconnect, which would retry
the same now-dead ticket forever. Full reasoning is in `DECISIONS.md`'s
"Task 26" entry.

**Known consequence, not a bug:** no missed-event replay — a client
disconnected when an event publishes simply misses that specific push;
nothing is permanently lost (the next fetch still shows current
state), but there's no catch-up mechanism for exactly what was missed.
Also: the dashboard's "live" indicator reflects this browser tab's own
SSE connection, not whether `worker.js` is actually running — Task 25's
known "worker not running" issue wouldn't show as "disconnected" here.

Before that: **Task 25 — background job queue (BullMQ + Render Key
Value), separate `worker.js` process, AI enrichment migrated off
fire-and-forget onto it with retry/backoff.** `ingestController` and
`projectController.simulateError` now enqueue an enrichment job
instead of calling `enrichErrorGroup` directly; the actual AI call now
happens in a genuinely separate process. `enrichErrorGroup`'s error
contract inverted as part of this — it used to swallow every failure
internally (nowhere to send one from fire-and-forget); it now
propagates retryable failures (Gemini API errors, transient Mongo
write failures) so BullMQ's retry/backoff can act on them, while
keeping a Gemini-response-failed-our-own-validation outcome terminal
(not retried — retrying an identical prompt against identical input
won't produce a different result). Full reasoning, alternatives
considered, and the real-infrastructure verification performed (a
local Redis was installed in-sandbox and two integration checks were
run against real BullMQ Queue/Worker instances, not just mocks) are in
`DECISIONS.md`'s "Task 25" entry.

**Known consequence, not a bug:** local dev now needs two processes
running for enrichment to actually happen — `npm run dev` (API) and
`npm run worker:dev` (worker) — not one. Without the worker running,
jobs queue up in Redis and wait; nothing is lost, but no `ErrorGroup`
gets an `aiSummary` until a worker consumes the queue.

**Not yet done:** `server/.env` does **not** currently have `REDIS_URL`
set at all (confirmed directly against the actual file, not assumed —
it's simply absent as a line). Without it, `config/env.js`'s
`redisUrl` is `undefined`, and ioredis falls back to its own default
of `127.0.0.1:6379` — meaning: if you have a local Redis actually
running on the default port, this currently works anyway without any
`.env` edit; if you don't have Redis running at all locally, nothing
Redis-dependent (Task 25's queue, Task 26's SSE) will work regardless
of what's in `.env`, and — as of the bug fix above — you'll now see a
clear, fast connection-refused error instead of a silent hang. Either
way, add an explicit `REDIS_URL=redis://localhost:6379` (or your real
Render Key Value connection string) to `.env` rather than relying on
the implicit default — being explicit here avoids exactly this kind of
"is it working because it's configured, or by accident of a matching
default" ambiguity. Needs a real Render Key Value instance provisioned
and swapped in before Task 37's deploy step regardless.

Before that: **Task 23 — dark theme, monospace tokens, table layout,
"Simulate Error" demo button.** Two parts: (1) a new global stylesheet
(`client/src/index.css`) applying a dark graphite/teal token system —
monospace specifically for data (error messages, stacks, counts,
timestamps, the API key), sans for UI chrome, severity/status as
colored pill badges — across all five client pages; (2) a
`POST /api/projects/:id/simulate` endpoint (JWT-authed, ownership-
scoped) backing the button, which reused (at the time)
`errorGroupService.recordEvent`/`enrichErrorGroup` directly — now
updated by Task 25 above to enqueue instead. Full reasoning in
`DECISIONS.md`'s "Task 23" entry.

**Known consequence, not a bug:** simulated errors' canned fake file
paths never match a real project's `githubRepo`, so simulated-error AI
enrichment always falls back to stack-trace-only confidence (`0.4`),
never the GitHub-grounded `0.8` — use the real `demo-app` to exercise
grounded enrichment specifically.

Before that: **Task 22 — Cursor pagination on the group list endpoint**
(`errorGroupService.listErrorGroups` now takes `{ limit, cursor }`,
returns `{ groups, nextCursor }`; sorted on `{ lastSeen: -1, _id: -1 }`
with `_id` as a tie-breaker for rows sharing a `lastSeen` millisecond;
`projectController.listProjectGroups` passes query params through and
translates invalid-limit/invalid-cursor into `400`s). Full reasoning
in `DECISIONS.md`'s "Task 22: cursor pagination on the group list
endpoint" entry. **Known consequence, not a bug:** the frontend
doesn't send `limit`/`cursor` or read `nextCursor` yet, so any project
with over 20 groups only shows its first page in the UI until the
client is updated — see Known Open Issues below.

Before that: **Task 21 — Payload size caps.** Rate limiting itself was
already pulled forward and shipped ahead of schedule in an earlier
pass; what remained was field-level length caps on ingestion:
`message` (≤1000 chars) and `stack` (≤10,000 chars) in
`ingestController.ingestEvent`, returning `400` when exceeded.
Deliberately doesn't touch `env`/`metadata` — their lack of validation
is an existing, separate, already-settled decision (accept-but-ignore,
forward-compatible), not something this task reopens. Full detail in
`DECISIONS.md`'s Shipped Log.

Also fixed this pass (unplanned, found at session start): **`client/src/App.jsx`
had been accidentally overwritten with a near-verbatim copy of
`server/app.js`** during the Task 20.2 commit — the client had no real
React `App` component, so the page rendered blank (`require` isn't
defined in the browser). `server/app.js` itself was untouched and
correct the whole time; this was a stray copy-paste into the wrong
file, not a missing edit to `app.js`. Restored from git history (the
commit immediately before the corrupting one). Full detail in
`DECISIONS.md`'s Shipped Log.

Before all of the above: **Task 20 — Centralized error middleware
(AppError + catchAsync) + validation pass**, across three subtasks:

- **20.1** — `utils/AppError.js`, `utils/catchAsync.js`, and
  `middleware/errorMiddleware.js` (single centralized handler,
  replacing the Task-1 stub; mounted last in `app.js`).
- **20.2** — Controllers refactored onto `catchAsync`/`AppError`,
  duplicated try/catch removed — except the deliberate local
  `CastError`-to-resource-specific-404 translation kept in
  `projectController`/`groupController` (only the controller layer
  knows the right resource name; the centralized handler's own
  `CastError` path is a generic fallback only).
- **20.3** — Validation pass: `projectController.createProject`/
  `updateProject` now reject a truthy-but-non-string `name` and a
  non-string `githubRepo`, closing the same typeof gap already fixed
  in `authController` (`updateProject` previously had *no* input
  validation before this). `githubRepo`'s format validation stays at
  the schema level (`Project.js`'s regex) — unchanged. `env`/
  `metadata` on ingestion remain deliberately unvalidated by design
  (see `DECISIONS.md`).

Full reasoning for each subtask is in `DECISIONS.md` — "Task 20.3:
project input validation — closing the typeof gap" plus the Shipped
Log entries for 20.1/20.2.

Docs had drifted after Task 18 (Tasks 19, 20.1, 20.2 shipped without a
doc update, per an explicit decision to batch this catch-up). This
pass reconciles `STATUS.md`/`TASKS.md`/`DECISIONS.md` against the
actual repo state for 19, 20.1, 20.2, and 20.3 all at once — no other
code changed as part of this reconciliation.

Before Task 20: **Task 19 — ErrorGroupDetail page** (AI panel as
checklist, event list, sparkline), backed by a new
`errorGroupService.getGroupDetail`/`groupController.getGroupDetail`
(`GET /api/groups/:id`, same ownership-check pattern as Task 18's
status update). Before that: **Task 18 — Status update endpoint +
UI**, closing out Milestone 4.

**(Task 18 detail, unchanged this pass — condensed here; full detail
in `DECISIONS.md`):** `errorGroupService.updateGroupStatus` enforces
ownership via a scoped `Project.findOne`, pushes a `statusHistory`
entry, never touches `lastSeen`. `groupController.updateStatus`
validates `status` against the enum before calling the service.
`PATCH /api/groups/:id/status` mounted behind JWT `authMiddleware`.

**Verified this pass (Task 20.3 only — 20.1/20.2/19 were verified in
their own original passes; full history in `DECISIONS.md`'s Shipped
Log):**
- Direct in-process call against `projectController` (fake `req`/`res`,
  no Express/DB): all four new validation branches (non-string `name`
  on create, non-string `githubRepo` on create, non-string `name` on
  update, empty-string `name` on update) return `400` before
  `projectService` is ever called.
- Server: `npm test` — all 19 tests still pass unchanged.
- `projectController.js` loads without throwing.

**Manual test status:**
- Task 23: `projectController.js`/`projectRoutes.js` verified to load
  without throwing; 22-test server suite passes unchanged (no existing
  test touches `projectController`). All client `.jsx` files verified
  to parse cleanly via a Babel JSX transform run outside the sandboxed
  `node_modules` (whose native Rollup/esbuild binaries are built for a
  different platform than this environment, so a real `vite build`
  couldn't be run here — see this pass's manual test instructions for
  what's owed against a live dev server: visual review of the theme,
  the Simulate Error button's full click → new-group/duplicate →
  table-update flow, and badge rendering for each severity/status
  value).
- Task 20.3's four `400` branches: exercised in-process only in their
  original pass; still owed against a live server (unchanged this
  pass).
- Task 21: verified in-process (both new `400` branches, boundary case
  passes validation) **and** confirmed by the user against a live
  local server this pass.
- Task 22: verified in-process/unit-test only (22-test suite,
  including 3 new tests for `hasMore`/`nextCursor`, invalid-limit, and
  invalid-cursor) **and** confirmed by the user against a live local
  server — first page, `limit=1` forcing a next page, following
  `nextCursor` to a second distinct group (via the demo-app's
  `/crash/range-error` route, after correcting a `demo-app/.env`
  `FAULTLINE_API_KEY` mismatch that had been reporting into a
  different project than the one under test — not a pagination bug,
  a local config mismatch), and both invalid-limit/invalid-cursor
  `400` cases.
- App.jsx fix: verified by inspection (diff against the pre-corruption
  git blob) plus a description of the expected browser-side symptom;
  not yet confirmed fixed in the user's actual browser as of this
  writing.

Tasks 17/18/19/20.1/20.2 remain closed exactly as previously recorded
— no changes to any of them this pass; full detail in `DECISIONS.md`.

Next up: **Task 29** — trend/spike detection, the next unstarted task
in Milestone 7, now that Task 28 is fully complete and verified live
(all three sub-parts). Recommended effort/thinking level: **medium-
high, thinking on** — the trend/spike algorithm itself needs care (see
`TASKS.md`'s Task 29 addendum for the baseline/floor logic already
specified), even though it also builds on existing infrastructure
(BullMQ, the sparkline area already built in Task 19).

## Constitution Amendments

- **Prior pass** — `PROJECT_RULES.md` §4/§8 amended at the user's
  explicit request: every session must now hand off (a) complete
  final contents of every changed file (not a diff/patch — the
  implementation sandbox is a separate filesystem from the user's real
  repo), with a narrow exception for large files where only one
  bounded section changed, and (b) detailed, copy-pasteable manual
  test instructions (exact commands, exact pass/fail signal), with
  honest disclosure when a test genuinely couldn't be run in-session.
- **Prior pass** — `PROJECT_RULES.md` §4 further amended: before
  starting implementation on a subtask, state a recommended effort
  level and whether extended thinking should be on, with a one-line
  reason. A recommendation for the user to set, not something Claude
  toggles itself.

## Known Open Issues

- **Atlas dev-cluster password rotation** — pending since Task 2.1,
  carried across multiple sessions. Still not done.
- **`extractErrorType()`'s generic `"Error"` bucket** for
  non-conventional error names — documented limitation, not a bug
  (see `DECISIONS.md`, "Fingerprint = hash(error type + normalized
  stack signature)").
- **`githubService`'s file-path heuristic** isn't guaranteed to match
  a given repo's real folder layout — a mismatch 404s and falls back
  to stack-trace-only grounding, never a hard failure (see
  `DECISIONS.md`, "githubService: snippet windowing + optional
  GITHUB_TOKEN").
- **Manual re-verification of the previous (Task 17) pass's changes is
  still owed**, carried forward unresolved: rate limiter thresholds,
  `apiKeyMiddleware`'s 5 cases post-refactor, response-shape
  byte-for-byte diffing, and the new Mongo index have not been run
  against a live Atlas cluster by the user yet either.
- **Task 22's pagination isn't consumed by the frontend yet** —
  `ProjectDetailPage.jsx` calls `GET /api/projects/:id/groups` with no
  `limit`/`cursor` and never reads `nextCursor` back. Any project with
  more than 20 error groups (the default page size) will only ever
  show its first page in the dashboard until the client is updated to
  paginate. Backend-only was the intended scope for Task 22 per the
  roadmap — this is a known, currently-live consequence of that scope,
  not a bug, but it's unresolved and worth fixing before relying on
  the dashboard for a project with real volume.
- **`demo-app/.env`'s `FAULTLINE_API_KEY` may not match the project
  currently under manual test** — discovered during Task 22's manual
  verification: the demo-app was silently reporting into a different
  project than the one being queried, which looked like a pagination
  bug (a new error group "wasn't showing up") but was actually a local
  config mismatch. Worth double-checking this file's key against
  whichever project you're testing before assuming a pagination/dedup
  issue is a real bug.
- **`server/.env` now has `REDIS_URL` set** (was missing entirely as of
  the entry that first diagnosed this — since resolved: the user added
  it and confirmed a local Redis running on the default port). A real
  Render Key Value instance still needs provisioning and swapping in
  before Task 37's deploy step — that part remains open.
- **Bug found and fixed: ad-hoc Redis commands (SSE ticket
  mint/lookup) used to hang forever, not fail, when Redis was
  unreachable** — found via the user's own manual browser testing
  (the "live" dot never appeared; a status change in one tab never
  reflected in another). Root cause: `config/redis.js`'s one shared
  connection had `maxRetriesPerRequest: null` (a hard BullMQ
  requirement) applied to *everything* on it, including
  `mintSseTicket`'s `SET` and the stream endpoint's `GETDEL` — commands
  that should fail fast, not retry forever. Fixed by splitting into
  `getBullConnection()` (unchanged, BullMQ-only) and a separately
  bounded `getRedisConnection()` (3 retries, 3s connect timeout) for
  ad-hoc commands. See `DECISIONS.md`'s "Bug fix: ad-hoc Redis commands
  hung forever when Redis was unreachable" entry. **This fix makes
  failures fail fast and visible — it does not remove the need to
  actually have a Redis server running** for Task 25/26 to work at
  all. (26.5's real two-tabs manual test has since been confirmed —
  see Task 26 in `TASKS.md`.)
- **No missed-event replay for SSE (Task 26)** — a client disconnected
  at the moment an event publishes simply misses that specific push.
  Nothing is permanently lost (the next fetch, whenever it happens,
  shows current state), but there's no catch-up mechanism for exactly
  what was missed while disconnected. Would need `Last-Event-ID`
  support and a small buffer of recent events per project to fix — not
  built, deliberately, to keep this task's scope to what was asked.
- **The dashboard's "live" indicator (Task 26) only reflects this
  browser tab's own SSE connection** — not whether `worker.js` is
  actually running. If the worker is down (Task 25's known open issue
  above), ingestion and status-update events still push fine and the
  indicator still shows "live," even though enrichment isn't
  completing in the background.
- **Local dev now requires two processes running for AI enrichment to
  actually happen** — `npm run dev` (API) and, separately,
  `npm run worker:dev` (the Task 25 worker). Without the worker
  running, enrichment jobs queue up in Redis and wait (nothing lost),
  but no `ErrorGroup` gets an `aiSummary` until a worker consumes the
  queue. Easy to forget when testing Task 26+ features that expect
  enrichment to complete.
- **Simulated errors (Task 23's "Simulate Error" button) never exercise
  GitHub-grounded AI enrichment** — the canned fake file paths
  (`/app/src/services/...`) won't match any real project's
  `githubRepo`, so `enrichErrorGroup` always falls back to stack-
  trace-only confidence (`0.4`) for these. Expected, not a bug — use
  the real `demo-app` (whose stack traces can be made to match an
  actual linked repo) to test grounded enrichment specifically.
- **Task 23's theme/button changes have not yet been visually confirmed
  in a real browser against a live server** — this pass verified
  syntax (all `.jsx` parse cleanly via Babel, run outside the sandboxed
  `node_modules` whose native binaries target a different platform than
  this environment) and that the server-side pieces load/test cleanly,
  but the actual rendered dark theme, badge colors, and the Simulate
  Error button's end-to-end click flow are still owed a live check —
  see this pass's manual test instructions.
- **Invalid API keys are not rate-limited on `POST /api/events` (Task
  27)** — `apiKeyMiddleware` rejects a missing/invalid key with `401`
  before the request ever reaches `ingestLimiter`, so someone hammering
  the endpoint with garbage keys hits no rate limit at all (only
  requests from a *successfully authenticated* project are limited).
  A separate, coarser IP-based limiter running *before*
  `apiKeyMiddleware` would close this — deliberately not built as part
  of Task 27, which was scoped to a different problem (one legitimate
  key's traffic throttling its IP-mates). Worth a future task if this
  project's threat model calls for it.

## Currently-Relevant Locked-In Decisions

Pointers only — see `DECISIONS.md` for full reasoning:

- Dedup uses atomic `findOneAndUpdate` upsert, not read-then-write ("Atomic upsert dedup: `findOneAndUpdate` before read-then-write").
- AI enrichment is enqueued as a BullMQ job and processed by a separate `worker.js` process, only for new groups — not called directly/fire-and-forget as it was before Task 25 (`AI_CONTEXT.md`'s Dispatch Model — originally wired in Task 13, updated in Task 25; see `DECISIONS.md`'s "Task 25" entry and its "errorGroupService.enrichErrorGroup: orchestration lives in errorGroupService, not aiService (Task 13)" entry).
- AI confidence is derived programmatically as a binary value (`0.8` grounded / `0.4` ungrounded), never self-reported by the LLM ("Task 14: confidence values and affectedFile/affectedFunction source").
- `aiService` is pure functions, not a 4-class provider hierarchy ("aiService: package and model choice").
- API-key auth (ingestion) and JWT auth (dashboard) are deliberately separate middleware ("API key hashing: SHA-256, not bcrypt").
- Raw fetched GitHub source snippets are never persisted ("githubService: snippet windowing + optional GITHUB_TOKEN").
- `apiKeyMiddleware`'s inert `timingSafeEqual` check was removed this pass — the hash-indexed `findOne` lookup is the actual security boundary ("apiKeyMiddleware: removal of inert timingSafeEqual check").
- The `httpResponse` helper (`sendSuccess`/`sendError`) is response-shaping only — a separate concern from the `AppError`/`catchAsync`/`errorMiddleware` trio Task 20 added; both are now in place and used together throughout controllers ("`httpResponse` helper: response-shaping only, not Task 20").
- `PATCH /api/groups/:id/status` enforces ownership via a scoped `Project.findOne({ _id, ownerId })` after looking up the group, not a fetch-then-compare — `ErrorGroup` has no `ownerId` field to scope on directly ("Task 18: ownership check for group status updates").
- `statusHistory` is appended to, never overwritten, and a status PATCH never bumps `lastSeen` (dedup-specific semantics stay unrelated to status edits — see "ErrorGroup uses firstSeen/lastSeen instead of Mongoose timestamps").
- `AppError`/`catchAsync`/centralized `errorMiddleware` are now the standard for every controller; the one exception is the local `CastError`→resource-specific-404 translation kept in `projectController`/`groupController` ("Task 20.1"/"Task 20.2" Shipped Log entries).
- `projectController.createProject`/`updateProject` typeof-guard `name`/`githubRepo` before calling the service; `githubRepo`'s format stays exclusively a schema-level (`Project.js`) concern ("Task 20.3: project input validation — closing the typeof gap").
- `POST /api/events` caps `message`/`stack` at 1000/10,000 characters — a field-level concern separate from the global 100kb body cap; `env`/`metadata` remain deliberately uncapped (Task 21 Shipped Log entry).
- `GET /api/projects/:id/groups` paginates via an opaque `{lastSeen, _id}` cursor, not offset/skip or `lastSeen` alone — `_id` is a required tie-breaker since `lastSeen` isn't guaranteed unique ("Task 22: cursor pagination on the group list endpoint").
- `POST /api/projects/:id/simulate` (JWT, ownership-scoped) reuses the exact same `errorGroupService.recordEvent` call and (as of Task 25) the same `enrichmentQueue.enqueueEnrichment` enqueue the real ingestion path uses, rather than exposing or reconstructing a project's one-way-hashed API key ("Task 23: dark theme + monospace tokens + table polish, and `POST /api/projects/:id/simulate`"; enqueue behavior updated in "Task 25").
- AI enrichment is enqueued as a BullMQ job (`services/enrichmentQueue.js`), consumed by a separate `worker.js` process — not called directly, fire-and-forget, as it was before Task 25. `enrichErrorGroup` now throws on retryable failures (propagates for BullMQ's retry/backoff) instead of swallowing everything internally; a Gemini-response-fails-validation outcome stays terminal/non-throwing ("Task 25: background job queue...").
- Live dashboard updates (`new_group`, `duplicate_recorded`, `status_changed`, `enrichment_completed`) are pushed via Server-Sent Events, authorized by a short-lived single-use ticket (not a JWT in the URL — see "Task 26" for why), and fanned out via one shared Redis pub/sub channel + in-process `EventEmitter`, not a Redis connection per SSE client ("Task 26: real-time dashboard updates via Server-Sent Events..."; `duplicate_recorded` added later — see "Duplicate events never pushed a live update").
- `ingestLimiter` (`POST /api/events`) keys on `req.project._id`, not `req.ip` — a shared IP no longer throttles every API key on it. Invalid-key traffic bypasses this limiter entirely (rejected by `apiKeyMiddleware` first) — a deliberately out-of-scope gap, not an oversight ("Task 27: per-API-key ingestion rate limiting").

## Where Things Live

- Blueprint / design review: repo root (or wherever the architecture
  review doc is kept) — treat as final, do not redesign.
- Living docs: `/docs`
- Server code: `/server`
- Client code: `/client` (Vite + React scaffold as of Task 15; real UI pages — Login/Register/Dashboard/ProjectDetail/GroupDetail — since Tasks 16-19)