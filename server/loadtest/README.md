# Load testing (Task 38)

Two-phase approach: get ingestion-only thresholds green first, add the
enrichment-latency measurement second. Don't try to make both pass on
the first run.

## Prerequisites

- k6 installed (`brew install k6` / see k6.io/docs/get-started/installation)
- API server running (`npm run dev` or against your Docker Compose
  stack once Task 39 exists)
- Worker running (`npm run worker`) — required for phase 2 only;
  phase 1 (ingestion-only) doesn't need it, since ingestion returns
  202 before enrichment happens.
- Local/dev MongoDB + Redis, **not production**

## Phase 1 — ingestion only (get this green first)

```bash
# 1. Seed test projects + API keys (run once, or re-run to reset)
node server/loadtest/seedTestProjects.js 25

# 2. Run k6 against ingestion only
BASE_URL=http://localhost:5000 k6 run server/loadtest/ingest.js
```

This exercises thresholds 1–4 (p95/p99 latency, error rate, checks).
Thresholds 5–6 (queue_wait_ms, enrichment_success_rate) will show as
`0 samples` and won't fail the run — they're simply not measured yet.

If threshold 1/2 fail: check whether you're actually hitting
`ingestLimiter`'s 429s (would also fail #3) — if so, increase the
project count in step 1, don't touch the limiter itself. If truly
ingestion is slow under real load, candidates to look at: Mongoose
connection pool size (`config/db.js` doesn't currently set
`maxPoolSize` explicitly — this is a legitimate first thing to tune,
see DECISIONS.md), and whether `recordEvent`'s fingerprint upsert is
doing redundant round-trips.

## Phase 2 — add enrichment-latency measurement

Requires a real `DASHBOARD_PASSWORD` for the seeded test user, since
`seedTestProjects.js` generates and discards a random one. Either:

- Edit `seedTestProjects.js` to use a fixed password for the test
  user (fine for a local-only test user), or
- Manually set one via the dashboard once the user exists.

```bash
BASE_URL=http://localhost:5000 \
MEASURE_ENRICHMENT=true \
DASHBOARD_EMAIL=loadtest@faultline.local \
DASHBOARD_PASSWORD=<your test user's real password> \
k6 run server/loadtest/ingest.js
```

Threshold 5 (`queue_wait_ms`) is bounded by Gemini API latency and
BullMQ's queue — not really "your" number the way ingestion latency
is. Don't chase a tight threshold here; a generous, honest number
(e.g. p95 < 20s) that reflects the actual worker+Gemini round trip is
more defensible than an artificially tight one.

If threshold 5/6 are failing because jobs pile up: `worker.js`
constructs its BullMQ `Worker` with no `concurrency` option, which
defaults to **1** — jobs process one at a time. Raising it (e.g.
`{ connection: getBullConnection(), concurrency: 5 }`) is a real,
legitimate tuning step for this task, not scope creep — record it in
`DECISIONS.md` if you make the change, same as any other tuning
decision in this project.

## After a passing run

Save the summary and write up `docs/PERFORMANCE.md` (template
provided in this repo). Keep the raw k6 output — it's what makes the
resume bullet's numbers defensible if asked about in an interview.

```bash
k6 run --summary-export=server/loadtest/last-run-summary.json server/loadtest/ingest.js
```

## Cleanup

Test projects are tagged `loadtest: true` (see `seedTestProjects.js`).
To remove them:

```js
// in a mongo shell or a throwaway script
db.projects.deleteMany({ loadtest: true })
```