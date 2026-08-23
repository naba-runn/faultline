const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const config = require('./config/env');
const errorMiddleware = require('./middleware/errorMiddleware');

const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const ingestRoutes = require('./routes/ingestRoutes');
const groupRoutes = require('./routes/groupRoutes');
const sseRoutes = require('./routes/sseRoutes');
const docsRoutes = require('./routes/docsRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const incidentRoutes = require('./routes/incidentRoutes');

const path = require('path');
const fs = require('fs');

const app = express();

// Security headers — configure CSP to allow modern frontend assets and SSE
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// CORS — allow configured client origin(s), wildcards, and any localhost port in development
const allowedOrigins = config.clientOrigin
  ? config.clientOrigin.split(',').map((s) => s.trim())
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server SDK ingestion)
      if (!origin || /^http:\/\/(localhost|127\.0\.0\.1):[0-9]+$/.test(origin)) {
        return callback(null, true);
      }
      if (
        config.clientOrigin === '*' ||
        allowedOrigins.includes(origin) ||
        origin === config.clientOrigin
      ) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Body parsing with a size cap — prevents unbounded payloads from
// reaching route handlers. Sourcemap uploads allow up to 5mb.
app.use('/api/projects/:id/sourcemaps', express.json({ limit: '5mb' }));
// Task 40.2: GitHub webhook signature verification needs the exact
// raw bytes GitHub signed — a re-serialized JSON.stringify(req.body)
// can differ in key order/whitespace from what was actually sent and
// would make every signature check fail. `verify` runs once per
// request, before req.body is populated, so this is the only place to
// capture it — mounted here (ahead of the generic parser below) for
// the same reason the sourcemaps line above is.
app.use(
  '/api/webhooks/github',
  express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Request logging — dev-friendly format locally, combined in production
app.use(morgan(config.isProduction ? 'combined' : 'dev'));

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/events', ingestRoutes);
app.use('/api/groups', groupRoutes);
// Task 26: deliberately NOT wrapped in authMiddleware at this level —
// see routes/sseRoutes.js for why. The ticket its one route reads is
// also logged by morgan below (it logs every request URL), same as
// any other route — that's fine by design, not an oversight: a
// single-use, ~30s ticket that's already been consumed by the very
// request that generated the log line has essentially nothing left to
// steal, unlike a long-lived, reusable JWT. See DECISIONS.md's "Task
// 26" entry.
app.use('/api/sse', sseRoutes);
app.use('/api/docs', docsRoutes);
// Task 40.2: public (no authMiddleware/apiKeyMiddleware) — see
// routes/webhookRoutes.js and controllers/webhookController.js for
// why (signature verification replaces JWT/API-key auth here).
app.use('/api/webhooks', webhookRoutes);
app.use('/api/incidents', incidentRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    env: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

// Serve frontend build if client/dist exists (single-service deployment support)
const clientDistPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// 404 handler — no route matched
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `No route for ${req.method} ${req.originalUrl}`,
  });
});

// Centralized error handler — Task 20. Must be mounted last. See
// middleware/errorMiddleware.js for the full handling order
// (AppError / CastError / ValidationError / unanticipated).
app.use(errorMiddleware);

module.exports = app;