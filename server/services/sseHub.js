// server/services/sseHub.js
//
// Task 26: the fan-out layer between Redis pub/sub and individual SSE
// HTTP connections held open in this API process.
//
// Design: ONE shared Redis subscriber connection for the whole
// process (config/redis.js's getRedisSubscriberConnection), subscribed
// once to a single fixed channel ("sse:events") for the process's
// entire lifetime — not one dedicated Redis connection per SSE client,
// and not per-project SUBSCRIBE/UNSUBSCRIBE churn either. Every
// publisher (ingestController, groupController, worker.js) sends a
// small JSON envelope `{ projectId, type, payload }` to that one
// channel; this module parses each incoming message and re-emits it
// locally (via a plain Node EventEmitter) under an event name scoped
// to that project. Each SSE route handler then just
// sseHub.subscribe(projectId, listener) for the lifetime of its own
// HTTP connection.
//
// Why this design and not a Redis connection per SSE client: Render's
// free Key Value tier has a real, published connection cap (~50, see
// DECISIONS.md's "Task 26" entry) — a handful of people viewing the
// dashboard simultaneously would exhaust that with a naive
// one-subscriber-per-client design. This way, connection count for
// pub/sub is exactly 1, regardless of how many SSE clients or
// projects are being watched concurrently. Publishing itself (see
// `publish` below) does NOT need a dedicated connection — PUBLISH,
// unlike SUBSCRIBE, doesn't change a connection's mode — so publishers
// reuse the existing shared getRedisConnection(), no new connection
// needed there either.

const { EventEmitter } = require('events');
const { getRedisConnection, getRedisSubscriberConnection } = require('../config/redis');

const CHANNEL = 'sse:events';

const emitter = new EventEmitter();
// Default cap is 10 — with many concurrent SSE viewers across many
// projects all registering listeners on this one shared emitter, that
// ceiling is real, not theoretical. Not a magic-number guess: generous
// headroom for a resume-scale demo, revisit only if actually exceeded.
emitter.setMaxListeners(200);

let subscribed = false;
function ensureSubscribed() {
  if (subscribed) return;
  subscribed = true;

  const sub = getRedisSubscriberConnection();
  sub.subscribe(CHANNEL).catch((err) => {
    console.error('[sseHub] failed to subscribe to Redis channel:', err.message);
  });

  sub.on('message', (channel, raw) => {
    if (channel !== CHANNEL) return;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (err) {
      console.error('[sseHub] received malformed pub/sub message, dropping:', err.message);
      return;
    }
    const { projectId, type, payload } = msg;
    if (!projectId || !type) return;
    emitter.emit(String(projectId), { type, payload });
  });
}

/**
 * Publishes an event for a given project to every SSE connection
 * currently subscribed to it, across this process (and, since this
 * goes through Redis rather than an in-memory call, across any other
 * API process instance too, and from worker.js's separate process —
 * see DECISIONS.md's "Task 26" entry for why Redis pub/sub is the one
 * mechanism used for all three emit points, not a special-cased hybrid
 * of in-memory-for-same-process + Redis-for-cross-process).
 */
async function publish(projectId, type, payload = {}) {
  await getRedisConnection().publish(CHANNEL, JSON.stringify({ projectId: String(projectId), type, payload }));
}

/**
 * Registers a listener for a specific project's events. Call
 * unsubscribe(projectId, listener) with the same function reference
 * when the SSE connection closes — the SSE route handler owns that
 * cleanup, this module does not track connection lifecycles itself.
 */
function subscribe(projectId, listener) {
  ensureSubscribed();
  emitter.on(String(projectId), listener);
}

function unsubscribe(projectId, listener) {
  emitter.off(String(projectId), listener);
}

module.exports = { publish, subscribe, unsubscribe };