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

const HEARTBEAT_INTERVAL_MS = 20000;

async function streamEvents(req, res) {
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

  // Prompt initial write so the client's EventSource.onopen fires
  // right away rather than waiting for the first real event, which
  // might be minutes away.
  res.write(': connected\n\n');

  const listener = ({ type, payload }) => {
    res.write(`data: ${JSON.stringify({ type, payload })}\n\n`);
  };
  sseHub.subscribe(projectId, listener);

  // Without a periodic write, some proxies (and Render's own, per its
  // docs on idle connections) will silently close a connection that's
  // gone quiet -- a comment line is invisible to EventSource's
  // onmessage (only `data:` lines fire it) but resets the idle clock.
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, HEARTBEAT_INTERVAL_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseHub.unsubscribe(projectId, listener);
  });
}

module.exports = { streamEvents };