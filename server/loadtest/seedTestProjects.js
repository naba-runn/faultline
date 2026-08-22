// server/loadtest/seedTestProjects.js
//
// Task 38.1 support script. Not part of the app's request path — run
// manually, once, before a k6 session.
//
// WHY THIS EXISTS: ingestLimiter (middleware/rateLimiter.js) caps
// ingestion at 100 req/min PER PROJECT (API key), by design (Task 27).
// A k6 run against a single project would just be measuring the rate
// limiter rejecting requests, not the real ingestion → queue → worker
// pipeline. This script creates N projects under one throwaway test
// user and writes their raw API keys to loadtest/keys.json, so the k6
// script (ingest.js) can round-robin across them — same pattern a real
// multi-tenant load pattern would produce (many customers, each within
// their own quota), and it's a more honest test than raising or
// disabling the limiter for the benchmark.
//
// Usage:
//   node server/loadtest/seedTestProjects.js [count]
//   (defaults to 50 projects — 50 * 100/min = 5000/min ≈ 83.3 req/s
//   aggregate ceiling. Raised from an original default of 25 after
//   Task 38's apiKeyMiddleware caching fix (see
//   utils/projectApiKeyCache.js) made real ingestion throughput fast
//   enough — ~77 req/s observed at 50 VUs — that 25 projects' ~41.6
//   req/s ceiling started rejecting legitimate load-test traffic with
//   429s, which briefly showed up as a false "error rate" regression
//   that was actually the test's own seed count, not the app. See
//   DECISIONS.md, "Task 38: ingestion latency thresholds.")
//
// Requires the same .env / MongoDB connection as the API itself. Safe
// to run against a local/dev database only — NOT production. Projects
// are identified by the `loadtest-` name prefix this script assigns
// (see LOADTEST_NAME_PREFIX_RE below) so they're easy to find and
// delete afterward.

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const connectDB = require('../config/db');
const Project = require('../models/Project');
const User = require('../models/User');
const { generateApiKey, hashApiKey } = require('../utils/apiKey');

const PROJECT_COUNT = parseInt(process.argv[2], 10) || 50;
const TEST_USER_EMAIL = 'loadtest@faultline.local';
const OUTPUT_PATH = path.join(__dirname, 'keys.json');
const LOADTEST_NAME_PREFIX_RE = /^loadtest-/;

async function getOrCreateTestUser() {
    let user = await User.findOne({ email: TEST_USER_EMAIL });
    if (!user) {
        user = await User.create({
            email: TEST_USER_EMAIL,
            // User's schema field is `passwordHash` (see models/User.js),
            // not `password` — the pre-save hook hashes whatever's set on
            // that field, it doesn't accept a separate plaintext-named
            // input. `password: ...` here was silently dropped by
            // Mongoose's strict schema, leaving passwordHash unset and
            // failing its own `required` validator on every seed run.
            passwordHash: crypto_randomPassword(),
            name: 'Load Test User',
        });
        console.log(`[seed] created test user ${TEST_USER_EMAIL}`);
    }
    return user;
}

// Password is never used to log in — the test only needs API-key auth
// (apiKeyMiddleware), never JWT — so a random throwaway value is fine.
// Kept out of the User.create() call above only for readability; this
// still runs through the model's normal pre-save bcrypt hook (Task 2.3).
function crypto_randomPassword() {
    return require('crypto').randomBytes(24).toString('hex');
}

async function seed() {
    await connectDB();

    const user = await getOrCreateTestUser();

    // Wipe any previous loadtest projects for this user so re-running
    // this script doesn't accumulate stale projects across sessions.
    //
    // Filtered by name prefix, not a `loadtest: true` field — Project's
    // schema is strict (the Mongoose default) and has no `loadtest`
    // field, so an earlier version of this script that set `loadtest:
    // true` on create() had it silently stripped on write, making this
    // deleteMany a permanent no-op: every run left the previous run's
    // projects in place, and their keys.json entries became orphaned
    // once overwritten below. The name prefix this script itself
    // assigns (`loadtest-${i}`) is unique to test projects and always
    // persisted, so it's what cleanup actually filters on.
    await Project.deleteMany({ ownerId: user._id, name: LOADTEST_NAME_PREFIX_RE });

    const keys = [];

    for (let i = 0; i < PROJECT_COUNT; i++) {
        const rawKey = generateApiKey();
        const project = await Project.create({
            ownerId: user._id,
            name: `loadtest-${i}`,
            apiKeyHash: hashApiKey(rawKey),
        });
        keys.push({ projectId: String(project._id), apiKey: rawKey });
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(keys, null, 2));
    console.log(`[seed] wrote ${keys.length} project API keys to ${OUTPUT_PATH}`);

    await mongoose.disconnect();
}

seed().catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
});