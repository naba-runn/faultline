// server/config/redis.js
//
// BUG FIX (found via manual browser testing after Task 26 — see
// DECISIONS.md's "Bug fix: ad-hoc Redis commands hung forever when
// Redis was unreachable" entry): this file originally exposed a single
// shared connection with `maxRetriesPerRequest: null` for everything.
// That setting is REQUIRED by BullMQ (Task 25's Queue/Worker) — but it
// also means ANY command on that connection retries forever and NEVER
// rejects if Redis is unreachable. `projectController.mintSseTicket`'s
// `SET` and `sseController.streamEvents`'s `GETDEL` were mistakenly
// sharing that same connection, so when Redis wasn't running, minting
// an SSE ticket didn't fail with an error — the HTTP request just hung
// forever, silently. That's exactly why the dashboard's "live"
// indicator never turned on: the client's ticket-mint request never
// resolved OR rejected, so neither the success path nor the
// catch-and-retry path in useProjectSSE.js ever ran.
//
// Fixed by splitting into two connections with genuinely different
// requirements:
//   - getBullConnection(): maxRetriesPerRequest: null, used ONLY by
//     BullMQ's Queue (enrichmentQueue.js) and Worker (worker.js) — this
//     really does need to retry forever, since BullMQ manages its own
//     retry/backoff semantics on top of it and is designed to recover
//     from a Redis restart without losing track of in-flight jobs.
//   - getRedisConnection(): bounded retries + a short connect timeout,
//     used for ad-hoc, request-scoped commands (ticket SET/GETDEL,
//     sseHub.js's PUBLISH) that should fail fast with a clear error
//     when Redis is unreachable, not hang an HTTP request indefinitely.
//
// Points at Render's free "Key Value" (Redis-compatible) tier in
// deployment — see DECISIONS.md's "Task 25" entry for why that was
// chosen over a third-party Redis host. For local dev, point
// REDIS_URL at a local Redis instance (see server/README or .env.example).
//
// Task 26 adds a dedicated connection specifically for pub/sub
// subscribing (see services/sseHub.js) — duplicated from the bounded
// getRedisConnection() above, not the BullMQ one, since a hung
// subscribe attempt has the same silent-failure problem this fix
// addresses. This is deliberate, not an oversight: once a Redis
// connection issues SUBSCRIBE, it can only receive pub/sub messages
// until it unsubscribes — it can't also be used for regular commands
// (SET/GET/BullMQ's own commands). Mixing the two on one connection
// isn't just inefficient, it doesn't work. Render's free Key Value
// tier also has a real, published connection cap (~50) — see
// DECISIONS.md's "Task 26" entry — so this is ONE extra shared
// subscriber connection for the whole API process, not one per SSE
// client; services/sseHub.js fans out to individual SSE connections
// in-process via a plain Node EventEmitter, not via Redis.

const Redis = require('ioredis');
const config = require('./env');

// Fails fast: at most 3 retries per command, capped backoff between
// attempts, and a 3s connection timeout — so a command issued while
// Redis is unreachable rejects within roughly 1-3 seconds instead of
// hanging indefinitely or retrying with ioredis's much longer default
// backoff schedule.
const FAST_FAIL_OPTIONS = {
  maxRetriesPerRequest: 3,
  connectTimeout: 3000,
  retryStrategy(times) {
    return Math.min(times * 200, 1000);
  },
};

let connection = null;
function getRedisConnection() {
  if (!connection) {
    connection = new Redis(config.redisUrl, FAST_FAIL_OPTIONS);

    connection.on('error', (err) => {
      console.error('[redis] connection error:', err.message);
    });
  }
  return connection;
}

let bullConnection = null;
function getBullConnection() {
  if (!bullConnection) {
    // maxRetriesPerRequest: null is a hard BullMQ requirement (it
    // throws at Queue/Worker construction time otherwise) — BullMQ
    // manages its own retry/backoff on top of this, so an
    // indefinitely-retrying connection is correct here, unlike the
    // ad-hoc connection above.
    bullConnection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

    bullConnection.on('error', (err) => {
      console.error('[redis:bullmq] connection error:', err.message);
    });
  }
  return bullConnection;
}

let subscriberConnection = null;
function getRedisSubscriberConnection() {
  if (!subscriberConnection) {
    // .duplicate() reuses the same connection options (including the
    // fast-fail retry settings above) rather than re-parsing config —
    // ioredis's own recommended way to get a second connection for
    // exactly this subscribe-needs-its-own-connection situation.
    subscriberConnection = getRedisConnection().duplicate();

    subscriberConnection.on('error', (err) => {
      console.error('[redis:subscriber] connection error:', err.message);
    });
  }
  return subscriberConnection;
}

module.exports = { getRedisConnection, getBullConnection, getRedisSubscriberConnection };