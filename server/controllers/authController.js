const authService = require('../services/authService');
const { sendSuccess, sendError } = require('../utils/httpResponse');

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return sendError(res, 400, 'email and password are both required');
    }

    const { user, token } = await authService.login({ email, password });

    return sendSuccess(res, 200, { user, token });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return sendError(res, statusCode, err.message || 'Internal Server Error');
  }
}

function me(req, res) {
  // authMiddleware already attached req.user (passwordHash excluded)
  return sendSuccess(res, 200, { user: req.user });
}



async function register(req, res) {
  try {
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
  } catch (err) {
    if (err.name === 'ValidationError') {
      return sendError(
        res,
        400,
        Object.values(err.errors)
          .map((e) => e.message)
          .join(', ')
      );
    }
    const statusCode = err.statusCode || 500;
    return sendError(res, statusCode, err.message || 'Internal Server Error');
  }
}

module.exports = { register, login, me };
