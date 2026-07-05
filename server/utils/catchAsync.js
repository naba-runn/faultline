/**
 * Wraps an async controller/middleware function so a rejected promise
 * (any thrown error, including ones from `await`-ed service calls) is
 * routed to `next(err)` instead of becoming an unhandled rejection.
 * This is what lets controllers drop their own try/catch blocks in
 * favor of the central error middleware in app.js — the wrapper is the
 * only place a .catch() needs to exist.
 *
 * Deliberately a plain higher-order function, not a class or a
 * decorator — same "no premature abstraction" reasoning as elsewhere
 * in this codebase (PROJECT_RULES.md §11).
 */
function catchAsync(fn) {
    return function wrapped(req, res, next) {
        return Promise.resolve(fn(req, res, next)).catch(next);
    };
}

module.exports = catchAsync;