const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * Signs a JWT for a given user ID. Pure function: no req/res, no DB
 * access, easily unit-testable.
 */
function generateToken(userId) {
  return jwt.sign({ sub: userId.toString() }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

module.exports = generateToken;