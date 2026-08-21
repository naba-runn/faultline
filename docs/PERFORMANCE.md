# Performance (Task 38)

Load test: k6 against `POST /api/events`, the real ingestion path
(`apiKeyMiddleware` → `ingestLimiter` → `ingestController` →
`errorGroupService.recordEvent` → BullMQ enqueue). Script and setup
instructions: `server/loadtest/`.

**What this measures vs. doesn't:** ingestion returns `202` as soon as
the event is persisted and enrichment is enqueued — AI enrichment
(Gemini call, `worker.js`) happens asynchronously and is deliberately
not awaited in the request path (Task 25). So the headline
latency/throughput numbers below describe the ingestion+dedup+enqueue
path specifically, not "how fast Faultline produces an AI summary."
Time-to-enrichment is a separate, secondary metric further down.

## Environment

- [ ] Fill in: local dev / Dockerized (Task 39) / deployed
- [ ] Fill in: machine specs if local (CPU, RAM) — matters for
      comparing dev vs. containerized runs honestly
- [ ] Fill in: MongoDB + Redis location (local / Render free tier /
      other)
- [ ] Fill in: number of seeded test projects (`seedTestProjects.js`
      arg) used for this run, and why (should be enough that
      `ingestLimiter`'s 100/min/project cap isn't the bottleneck —
      see `server/loadtest/README.md`)

## Test design

- 50 VUs, ramping: 30s ramp-up → 2m sustained → 30s ramp-down
- Requests round-robin across N seeded projects/API keys specifically
  to avoid the per-project rate limiter becoming the bottleneck being
  measured (see DECISIONS.md, "Task 38: multi-project load test
  design")
- Each request uses a randomized stack trace/message so events spread
  across many ErrorGroups instead of colliding into one fingerprint
  (avoids the Task 28 fingerprint-collision lesson skewing results)

## Results — ingestion path (phase 1)

| Metric | Threshold | Result | Pass? |
|---|---|---|---|
| p95 latency | < 150ms | *fill in* | |
| p99 latency | < 300ms | *fill in* | |
| Error rate | < 1% | *fill in* | |
| Checks pass rate | > 99% | *fill in* | |
| Throughput | — (reported, not thresholded) | *fill in* req/s | |

## Results — enrichment latency (phase 2, optional)

| Metric | Threshold | Result | Pass? |
|---|---|---|---|
| Time-to-enrichment p95 (`queue_wait_ms`) | < 20s | *fill in* | |
| Enrichment completion rate | > 95% | *fill in* | |

## Tuning notes

*Fill in anything changed between the first run and the final passing
run — e.g. Mongoose `maxPoolSize`, BullMQ worker `concurrency`,
`ingestLimiter` project count for the test itself (not the app's real
limiter, which shouldn't change). If a threshold was lowered rather
than the system tuned, say so plainly here — this file is meant to be
defensible in an interview, not to look better than the real numbers.*

## Containerized re-run (Task 39.6)

*Fill in after Task 39 — same test, same thresholds, run against the
`docker compose up` stack. Note any delta vs. the dev-environment
numbers above (usually a small latency increase from container
networking overhead — expected, not a regression to chase).*