// server/loadtest/ingest.js
//
// Task 38. k6 load test against POST /api/events (the real ingestion
// path — apiKeyMiddleware -> ingestLimiter -> ingestController ->
// errorGroupService.recordEvent -> BullMQ enqueue). Run after
// seedTestProjects.js has written loadtest/keys.json.
//
// WHAT THIS DOES NOT MEASURE: ingestEvent returns 202 as soon as the
// event is persisted — AI enrichment (worker.js, Gemini calls) happens
// asynchronously and is NOT awaited in the request/response cycle
// (Task 25's whole point). So http_req_duration here measures the
// real ingestion+dedup+enqueue path, not enrichment latency. Time-to-
// enrichment is tracked separately below as a custom metric via
// polling, specifically so it doesn't get conflated with ingestion
// latency in the headline numbers — these are two different claims
// ("ingestion is fast" vs "enrichment completes eventually") and
// DECISIONS.md should say so when you write up results.
//
// Usage:
//   BASE_URL=http://localhost:5000 \
//   DASHBOARD_EMAIL=loadtest@faultline.local \
//   DASHBOARD_PASSWORD=... \
//   k6 run server/loadtest/ingest.js
//
// (DASHBOARD_PASSWORD isn't the one seedTestProjects.js randomly
// generated for the test user — that password is thrown away. Either
// add a fixed password when seeding, or skip the enrichment-latency
// metric entirely by removing pollForEnrichment() below and running
// ingestion-only. Ingestion-only is a perfectly legitimate first pass
// — get thresholds 1-4 green before adding the poll-based ones.)

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const MEASURE_ENRICHMENT = __ENV.MEASURE_ENRICHMENT === 'true';

// SharedArray loads keys.json once and shares it read-only across all
// VUs (k6's recommended pattern for shared test data — avoids each VU
// holding its own copy).
const keys = new SharedArray('project keys', function () {
    return JSON.parse(open('./keys.json'));
});

// Custom metrics — these plus the four built-in ones below give six
// total thresholds, matching the "six custom performance thresholds"
// framing this test is benchmarked against.
//
// Named enrichment_latency_ms, not queue_wait_ms: what pollForEnrichment
// actually times is the full span from the ingestion response to
// aiSummary becoming visible via HTTP polling — enqueue-to-job-start
// queue wait, the Gemini API round trip, the DB write, AND up to
// pollIntervalMs of polling-granularity slop, all bundled together.
// True queue-wait-time (Task 38.3's original spec: enqueue timestamp
// vs job-start in worker.js) isn't observable from here at all — k6
// only ever sees this process from the outside over HTTP, and
// worker.js has no endpoint exposing its internal per-job timestamps.
// Getting that split metric would mean adding new instrumentation
// (e.g. worker.js writing enqueue/start deltas somewhere k6 can read
// them) — out of scope for this fix; this rename just makes the
// metric's name match what it actually measures instead of claiming
// a narrower, more precise thing than it delivers.
const enrichmentLatencyMs = new Trend('enrichment_latency_ms', true);
const enrichmentSuccessRate = new Rate('enrichment_success_rate');

export const options = {
    scenarios: {
        ingestion_load: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 50 }, // ramp up
                { duration: '2m', target: 50 }, // sustained load
                { duration: '30s', target: 0 }, // ramp down
            ],
        },
    },
    thresholds: {
        // 1 & 2. Ingestion latency — p95 is the headline number for the
        //    resume bullet, p99 is a stricter, separate tail-latency claim.
        //    Full history per Task 38.4 (see DECISIONS.md, "Task 38:
        //    ingestion latency thresholds" for the complete investigation):
        //      run 1 (default pool): p95 875ms, p99 1.12s — both original
        //        150ms/300ms guesses failed.
        //      run 2 (maxPoolSize: 150): p95 896ms, p99 1.36s — no
        //        improvement, ruling out client-side pool contention.
        //      Diagnosis: an isolated unloaded request cost ~110ms —
        //        three sequential DB round trips per ingest
        //        (apiKeyMiddleware's Project lookup, the ErrorGroup
        //        upsert, the ErrorEvent create). Thresholds were
        //        temporarily lowered to 1000ms/1600ms at this point as an
        //        honest reflection of the real ceiling.
        //      Fix: cached the Project lookup (utils/projectApiKeyCache.js,
        //        30s TTL, evicted immediately on project delete — removes
        //        one of the three round trips for the ~100% of requests
        //        that reuse a key repeatedly, which every real caller
        //        does).
        //      Run 3 (cached): p95 96.5ms, p99 175ms, 0% errors — beats
        //        the ORIGINAL guesses. Thresholds restored to reflect
        //        this, not left at the temporarily-lowered numbers.
        //    (One side effect surfaced along the way: faster requests
        //    meant more throughput fit in the same test window, which
        //    briefly exceeded ingestLimiter's 100/min/project cap at 25
        //    seeded projects — see seedTestProjects.js's updated project
        //    count.)
        'http_req_duration{endpoint:ingest}': ['p(95)<150', 'p(99)<300'],
        // 3. Error rate.
        http_req_failed: ['rate<0.01'],
        // 4. Functional correctness under load, not just "got a 200-ish
        //    status" — checks() below verifies the response body shape.
        checks: ['rate>0.99'],
        // 5. Time from a new-group event's ingestion response to its
        //    ErrorGroup actually carrying an aiSummary (worker + Gemini
        //    round trip). Generous — this is bounded by Gemini API latency
        //    and BullMQ's queue, not by your code, so don't chase a tight
        //    number here the way you would for #1/#2.
        enrichment_latency_ms: ['p(95)<20000'],
        // 6. Of the new-group events actually polled, what fraction
        //    reached aiSummary within the poll window at all (vs timing
        //    out) — a completeness metric, distinct from #5's speed metric.
        enrichment_success_rate: ['rate>0.95'],
    },
};

function randomStack() {
    // Randomized function/line so groups don't all collide into one
    // fingerprint (Task 8's canonical fingerprint hashes type +
    // normalized message + normalized stack — see Task 28's
    // fingerprint-collision lesson in DECISIONS.md; a fixed stack
    // across all VUs would dedup everything into a handful of groups
    // and under-exercise the dedup/upsert path this test should cover).
    const fn = `handler_${Math.floor(Math.random() * 5000)}`;
    const line = Math.floor(Math.random() * 500) + 1;
    return (
        `TypeError: Cannot read properties of undefined\n` +
        `    at ${fn} (/app/src/services/orderService.js:${line}:12)\n` +
        `    at processRequest (/app/src/middleware/handler.js:44:5)`
    );
}

export default function (data) {
    const key = keys[__VU % keys.length];

    const payload = JSON.stringify({
        message: `Unhandled error in checkout flow (vu=${__VU} iter=${__ITER})`,
        stack: randomStack(),
        env: 'loadtest',
        release: 'v0.0.0-loadtest',
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key.apiKey}`,
        },
        tags: { endpoint: 'ingest' },
    };

    const res = http.post(`${BASE_URL}/api/events`, payload, params);

    const ok = check(res, {
        'status is 202': (r) => r.status === 202,
        'body has errorGroupId': (r) => {
            try {
                return JSON.parse(r.body).data.errorGroupId != null;
            } catch {
                return false;
            }
        },
    });

    if (ok && MEASURE_ENRICHMENT) {
        const body = JSON.parse(res.body).data;
        if (body.isNewGroup) {
            pollForEnrichment(body.errorGroupId, data.token);
        }
    }

    sleep(1);
}

// Polls GET /api/groups/:id (JWT-authed, Task 18) until aiSummary
// appears or a timeout is hit. `token` comes from setup()'s return
// value (the `data` param above) — NOT from mutating __ENV inside
// setup(), which does not work: each VU runs in its own isolated JS
// context in k6, so only setup()'s return value (passed as `data`
// into default(data)) actually crosses that boundary. An earlier
// draft of this file tried writing to __ENV from setup() and reading
// it back here — that silently no-ops across VUs and was caught
// before this was ever run for real. Worth remembering if you extend
// this script later.
function pollForEnrichment(errorGroupId, token) {
    if (!token) return; // enrichment measurement silently skipped if no token

    const maxWaitMs = 25000;
    const pollIntervalMs = 1000;
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
        sleep(pollIntervalMs / 1000);
        const res = http.get(`${BASE_URL}/api/groups/${errorGroupId}`, {
            headers: { Authorization: `Bearer ${token}` },
            tags: { endpoint: 'group-detail-poll' },
        });
        try {
            // GET /api/groups/:id responds with { data: { group, events,
            // environments, trend } } (groupController.getGroupDetail) —
            // aiSummary lives on `.group`, not on `.data` directly. An
            // earlier version of this poll read `.data.aiSummary`, which
            // is always undefined regardless of whether enrichment
            // actually completed, so this metric would report 0%
            // success against a perfectly healthy pipeline every time
            // MEASURE_ENRICHMENT was turned on.
            const body = JSON.parse(res.body).data;
            if (body?.group?.aiSummary) {
                enrichmentLatencyMs.add(Date.now() - start);
                enrichmentSuccessRate.add(true);
                return;
            }
        } catch {
            // ignore malformed poll response, keep polling until timeout
        }
    }
    enrichmentSuccessRate.add(false);
}

// setup() runs once, before VUs start — logs in as the dashboard test
// user so pollForEnrichment() has a JWT. If DASHBOARD_EMAIL/PASSWORD
// aren't set, MEASURE_ENRICHMENT should be left false (default) and
// this test only measures ingestion latency (thresholds 1-4) — a
// legitimate, honest first pass. See file header.
export function setup() {
    if (!MEASURE_ENRICHMENT) return {};

    const email = __ENV.DASHBOARD_EMAIL;
    const password = __ENV.DASHBOARD_PASSWORD;
    if (!email || !password) {
        throw new Error(
            'MEASURE_ENRICHMENT=true requires DASHBOARD_EMAIL and DASHBOARD_PASSWORD env vars'
        );
    }
    const res = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify({ email, password }),
        { headers: { 'Content-Type': 'application/json' } }
    );
    const token = JSON.parse(res.body).data.token;
    return { token };
}