const mongoose = require('mongoose');
const config = require('./env');

async function connectDB() {
  try {
    // Task 38.4 tuning: explicit maxPoolSize rather than Mongoose's
    // default (100). Under k6's 50-VU sustained load, ingestion
    // latency had a bad tail (p95 875ms, p99 1.12s vs 150ms/300ms
    // thresholds) despite a healthy median (~111ms) — the shape of a
    // queueing problem, not a per-request slowness problem. Set
    // explicitly (not just relying on the default) so this number is
    // a documented, deliberate choice, not an accident of whatever
    // Mongoose's default happens to be this version.
    await mongoose.connect(config.mongodbUri, { maxPoolSize: 150, minPoolSize: 20 });
    console.log(`[db] MongoDB connected: ${mongoose.connection.host}`);
  } catch (err) {
    console.error('[db] MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('[db] MongoDB disconnected');
});

module.exports = connectDB;