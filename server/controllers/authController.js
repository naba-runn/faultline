const authService = require('../services/authService');

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'email and password are both required',
      });
    }

    const { user, token } = await authService.login({ email, password });

    res.status(200).json({
      success: true,
      data: { user, token },
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: err.message || 'Internal Server Error',
    });
  }
}

function me(req, res) {
  // authMiddleware already attached req.user (passwordHash excluded)
  res.status(200).json({
    success: true,
    data: { user: req.user },
  });
}



async function register(req, res) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'name, email, and password are all required',
      });
    }

    const { user, token } = await authService.register({ name, email, password });

    res.status(201).json({
      success: true,
      data: { user, token },
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: Object.values(err.errors)
          .map((e) => e.message)
          .join(', '),
      });
    }
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: err.message || 'Internal Server Error',
    });
  }
}

module.exports = { register, login, me };