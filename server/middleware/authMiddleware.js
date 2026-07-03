const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');

/**
 * Verifies the JWT in the Authorization header (Bearer scheme) and
 * attaches the corresponding user to req.user. Rejects with 401 for
 * any failure mode — missing header, malformed token, invalid
 * signature, expired token, or a token whose user no longer exists.
 * Deliberately doesn't distinguish these cases in the response body,
 * same enumeration-avoidance reasoning as login.
 */
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized, no token provided',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(decoded.sub).select('-passwordHash');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized, user no longer exists',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized, invalid or expired token',
    });
  }
}

module.exports = authMiddleware;