const authService = require('../services/authService');
const { sendSuccess, sendError } = require('../utils/httpResponse');
const catchAsync = require('../utils/catchAsync');

// catchAsync forwards any rejection (authService's AppError throws,
// a Mongoose ValidationError from User.create, or anything
// unanticipated) to the central error middleware — see
// middleware/errorMiddleware.js. Local sendError calls below are for
// non-exceptional input validation only, not error-path handling.

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return sendError(res, 400, 'email and password are both required');
  }

  const { user, token } = await authService.login({ email, password });

  return sendSuccess(res, 200, { user, token });
});

function me(req, res) {
  // authMiddleware already attached req.user (passwordHash excluded)
  return sendSuccess(res, 200, { user: req.user });
}

const register = catchAsync(async (req, res) => {
  const { name, email, password } = req.body;

  if (
    !name || typeof name !== 'string' ||
    !email || typeof email !== 'string' ||
    !password || typeof password !== 'string'
  ) {
    return sendError(res, 400, 'name, email, and password are all required');
  }

  const { user, token } = await authService.register({ name, email, password });

  return sendSuccess(res, 201, { user, token });
});

module.exports = { register, login, me };