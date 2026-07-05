/**
 * Operational error type for anything a controller/service deliberately
 * throws to signal "send this exact status code and message to the
 * client" — validation failures, not-found, auth failures raised
 * outside the auth middlewares, etc.
 *
 * `isOperational: true` marks this as an anticipated, handled failure
 * mode (as opposed to a programmer error / bug), so the central error
 * middleware (app.js) can treat AppError instances as safe to expose
 * `message` for, while still logging anything else's stack server-side
 * without leaking internals to the client. This is the only new
 * concept Task 20 introduces — no provider hierarchy, no error-code
 * enum, see PROJECT_RULES.md §11 on premature abstraction.
 */
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;