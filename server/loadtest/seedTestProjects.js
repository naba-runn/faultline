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
//   (defaults to 25 projects — 25 * 100/min = 2500/min ≈ 41.6 req/s
//   aggregate ceiling, comfortably above the 26.5 req/s target this
//   test is benchmarked against.)
//
// Requires the same .env / MongoDB connection as the API itself. Safe
// to run against a local/dev database only — NOT production. Projects
// are tagged with a `loadtest: true` flag (see below) so they're easy
// to find and delete afterward.

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const connectDB = require('../config/db');
const Project = require('../models/Project');
const User = require('../models/User');
const { generateApiKey, hashApiKey } = require('../utils/apiKey');

const PROJECT_COUNT = parseInt(process.argv[2], 10) || 25;
const TEST_USER_EMAIL = 'loadtest@faultline.local';
const OUTPUT_PATH = path.join(__dirname, 'keys.json');

async function getOrCreateTestUser() {
    let user = await User.findOne({ email: TEST_USER_EMAIL });
    if (!user) {
        user = await User.create({
            email: TEST_USER_EMAIL,
            password: crypto_randomPassword(),
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
    await Project.deleteMany({ ownerId: user._id, loadtest: true });

    const keys = [];

    for (let i = 0; i < PROJECT_COUNT; i++) {
        const rawKey = generateApiKey();
        const project = await Project.create({
            ownerId: user._id,
            name: `loadtest-${i}`,
            apiKeyHash: hashApiKey(rawKey),
            loadtest: true, // ad-hoc flag — see note below if your Project
            // schema is `strict` and rejects unknown fields; either add
            // `loadtest: { type: Boolean, default: false }` to Project.js
            // permanently (harmless, useful for cleanup), or drop this line
            // and filter by name prefix ("loadtest-") instead when cleaning up.
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