// demo-app/index.js
//
// A minimal Express app whose only purpose is to throw a few sample
// errors and forward them to Faultline's ingestion endpoint, so dedup
// can be verified manually end-to-end (repeated hits on one route
// should collapse into one ErrorGroup; different routes should not).

require('dotenv').config();
const express = require('express');

const PORT = process.env.PORT || 4000;
const FAULTLINE_API_URL = process.env.FAULTLINE_API_URL;
const FAULTLINE_API_KEY = process.env.FAULTLINE_API_KEY;

const app = express();

function reportToFaultline(err) {
  if (!FAULTLINE_API_URL || !FAULTLINE_API_KEY) {
    console.error('[demo-app] FAULTLINE_API_URL/FAULTLINE_API_KEY not set — skipping report');
    return;
  }

  fetch(FAULTLINE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${FAULTLINE_API_KEY}`,
    },
    body: JSON.stringify({
      message: err.message,
      stack: err.stack,
      env: process.env.NODE_ENV || 'development',
      metadata: { source: 'demo-app' },
    }),
  })
    .then((res) => res.json())
    .then((data) => console.log('[demo-app] reported to Faultline:', data))
    .catch((reportErr) => console.error('[demo-app] failed to report to Faultline:', reportErr.message));
}

app.get('/crash/type-error', () => {
  throw new TypeError('Cannot read properties of undefined (reading \'x\')');
});

app.get('/crash/range-error', () => {
  const arr = [1, 2, 3];
  arr.length = -1; // throws RangeError
});

app.get('/crash/custom', () => {
  throw new Error('Simulated payment processing failure');
});

app.get('/', (req, res) => {
  res.json({
    routes: ['/crash/type-error', '/crash/range-error', '/crash/custom'],
    note: 'Hit any route repeatedly to test dedup; hit different ones to test distinct fingerprints.',
  });
});

app.use((err, req, res, next) => {
  console.error(`[demo-app] caught error on ${req.path}:`, err.message);
  reportToFaultline(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`[demo-app] listening on port ${PORT}`);
  console.log(`[demo-app] reporting to ${FAULTLINE_API_URL || '(not configured)'}`);
});