// server/controllers/sseController.js
//
// Task 26: the SSE stream endpoint itself. Deliberately NOT behind
// authMiddleware -- native EventSource can't send an Authorization
// header, so this route has no JWT to check. Security instead comes
// entirely from the ticket: minted by projectController.mintSseTicket
// (JWT-authed, ownership-checked, at mint time), single-use, and dead
// within 30 seconds. See DECISIONS.md's "Task 26" entry for the full
// reasoning, including why a JWT-in-query-string was rejected (this
// app's morgan request logging would write it to server logs in
// plaintext).

const { getRedisConnection } = require('../config/redis');
const sseHub = require('../services/sseHub');
const catchAsync = require('../utils/catchAsync');

const HEARTBEAT_INTERVAL_MS = 20000;

// Wrapped in catchAsync like every other controller in this app, plus
// a res.on('error') guard below -- belt and suspenders. catchAsync
// alone only protects the initial promise chain (the ticket-lookup
// code before headers are sent); once the stream is open, res.write()
// calls happen inside separate callbacks (the pub/sub listener, the
// heartbeat timer) that catchAsync can't see. Without the res.on
// guard, an EventEmitter's default behavior for an unhandled 'error'
// event is to throw synchronously, and server.js's uncaughtException
// handler kills the entire process on that -- one client's dead
// connection would take down every other open SSE stream, not just
// its own.
const streamEvents = catchAsync(async function streamEvents(req, res) {
  const { ticket } = req.query;

  if (!ticket || typeof ticket !== 'string') {
    return res.status(401).json({ success: false, error: 'Missing ticket' });
  }

  // GETDEL: atomic read-then-delete in one command -- burns the
  // ticket on first use without a separate transaction. Two
  // concurrent requests with the same ticket can't both succeed; the
  // second one simply finds nothing.
  let raw;
  try {
    raw = await getRedisConnection().getdel(`sse:ticket:${ticket}`);
  } catch (err) {
    console.error('[sse] ticket lookup failed:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to validate ticket' });
  }

  if (!raw) {
    return res.status(401).json({ success: false, error: 'Invalid or expired ticket' });
  }

  let projectId;
  try {
    ({ projectId } = JSON.parse(raw));
  } catch (err) {
    console.error('[sse] ticket payload was not valid JSON:', err.message);
    return res.status(401).json({ success: false, error: 'Invalid ticket' });
  }

  // SSE headers. X-Accel-Buffering: no is aimed at proxies that buffer
  // responses by default (some do, regardless of Content-Type) --
  // harmless to send even against proxies that ignore it.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  // res.write() can fail if the socket dies in the window between the
  // client disconnecting and 'close' actually firing on req below --
  // a real race, not a theoretical one, on a long-lived connection.
  // Swallow it here (log + cleanup) instead of letting it propagate:
  // an EventEmitter's default behavior for an unhandled 'error' is to
  // throw, and that throw would otherwise crash the whole process (see
  // the comment above streamEvents).
  const safeWrite = (chunk) => {
    try {
      res.write(chunk);
    } catch (err) {
      console.error('[sse] write failed, tearing down this connection:', err.message);
      teardown();
    }
  };

  function teardown() {
    clearInterval(heartbeat);
    sseHub.unsubscribe(projectId, listener);
  }

  res.on('error', (err) => {
    console.error('[sse] response stream error:', err.message);
    teardown();
  });

  // Prompt initial write so the client's EventSource.onopen fires
  // right away rather than waiting for the first real event, which
  // might be minutes away.
  safeWrite(': connected\n\n');

  const listener = ({ type, payload }) => {
    safeWrite(`data: ${JSON.stringify({ type, payload })}\n\n`);
  };
  sseHub.subscribe(projectId, listener);

  // Without a periodic write, some proxies (and Render's own, per its
  // docs on idle connections) will silently close a connection that's
  // gone quiet -- a comment line is invisible to EventSource's
  // onmessage (only `data:` lines fire it) but resets the idle clock.
  const heartbeat = setInterval(() => {
    safeWrite(': heartbeat\n\n');
  }, HEARTBEAT_INTERVAL_MS);

  req.on('close', teardown);
});

module.exports = { streamEvents };