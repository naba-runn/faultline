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

const app = express();

// Security headers
app.use(helmet());

// CORS — allow only the configured client origin
app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
  })
);

// Body parsing with a size cap — prevents unbounded payloads from
// reaching route handlers. Ingestion-specific field-level validation
// (stackSample/metadata max length) is a separate concern, added in
// Task 21.
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

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    env: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

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