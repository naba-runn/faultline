const authService = require('../services/authService');

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

module.exports = { register };