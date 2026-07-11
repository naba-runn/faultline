// server/config/redis.js
//
// Task 25: a single shared ioredis connection, used by both the queue
// producer (services/enrichmentQueue.js, running inside the API
// process) and the queue consumer (worker.js, a separate process).
// BullMQ requires ioredis specifically — not the `redis` npm package
// — and requires `maxRetriesPerRequest: null` on any connection handed
// to a Queue or Worker; BullMQ throws at construction time otherwise,
// since it manages blocking-command retries itself.
//
// Points at Render's free "Key Value" (Redis-compatible) tier in
// deployment — see DECISIONS.md's "Task 25" entry for why that was
// chosen over a third-party Redis host. For local dev, point
// REDIS_URL at a local Redis instance (see server/README or .env.example).

const Redis = require('ioredis');
const config = require('./env');

let connection = null;

function getRedisConnection() {
  if (!connection) {
    connection = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
    });

    connection.on('error', (err) => {
      console.error('[redis] connection error:', err.message);
    });
  }
  return connection;
}

module.exports = { getRedisConnection };