const config = require('../config/env');

/**
 * Single centralized error handler — the only place in the app that
 * turns a thrown/`next(err)`-ed error into an HTTP response body.
 * Replaces the Task-1 stub that lived directly in app.js.
 *
 * Handling order:
 *   1. AppError (or anything else explicitly marked `isOperational`)
 *      — trusted message, use its statusCode as-is.
 *   2. Mongoose CastError (malformed ObjectId in a route param) — 404,
 *      generic message. This is a controller-agnostic fallback only;
 *      controllers that want a resource-specific 404 message (e.g.
 *      "Project not found") should keep doing that via their own
 *      null-check + AppError, not rely on this generic path.
 *   3. Mongoose ValidationError — 400, concatenated field messages,
 *      same shape controllers were already producing per-file before
 *      this refactor.
 *   4. Anything else — treated as an unanticipated bug: full stack
 *      logged server-side, generic 500 message returned to the
 *      client. Never leak `err.message` for non-operational errors,
 *      since it may contain internals (file paths, driver internals,
 *      etc).
 *
 * Must be mounted last, after all routes and the 404 handler.
 */
function errorMiddleware(err, req, res, next) { // eslint-disable-line no-unused-vars
    if (err.isOperational) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: err.message,
        });
    }

    if (err.name === 'CastError') {
        return res.status(404).json({
            success: false,
            error: 'Resource not found',
        });
    }

    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: Object.values(err.errors)
                .map((e) => e.message)
                .join(', '),
        });
    }

    // Unanticipated error — log full detail server-side only.
    console.error(err.stack || err);

    return res.status(500).json({
        success: false,
        error: config.isProduction
            ? 'Internal Server Error'
            : err.message || 'Internal Server Error',
    });
}

module.exports = errorMiddleware;