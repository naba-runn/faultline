const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const config = require('./config/env');

const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const apiKeyMiddleware = require('./middleware/apiKeyMiddleware');

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

// TEMPORARY — Task 6.1 manual test route only. Not part of the real
// API surface. Exercises apiKeyMiddleware in isolation (no JWT)
// since nothing mounts it for real until Task 7's ingestion
// endpoint. Delete this block when Task 7 lands.
app.get('/api/_test/verify-key', apiKeyMiddleware, (req, res) => {
  res.status(200).json({
    success: true,
    data: { projectId: req.project._id, projectName: req.project.name },
  });
});

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

// Centralized error handler (stub) — replaced with AppError/catchAsync
// pattern in Task 20. For now, catches anything passed to next(err).
app.use((err, req, res, next) => {
  console.error(err.stack);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

module.exports = app;