const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const required = ['MONGODB_URI', 'JWT_SECRET', 'REDIS_URL'];

function validateEnv(env) {
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0 && env.NODE_ENV !== 'test') {
    // Warn rather than crash at import time — server.js decides whether
    // to refuse to start. Keeps this module side-effect-light and testable.
    console.warn(
      `[env] Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

validateEnv(process.env);

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,

  mongodbUri: process.env.MONGODB_URI,

  redisUrl: process.env.REDIS_URL,

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  geminiApiKey: process.env.GEMINI_API_KEY || null,
  // Optional — Contents API works unauthenticated for public repos
  // (60 req/hour). Only needed for private repos or to raise the rate
  // limit. See DECISIONS.md (Task 12).
  githubToken: process.env.GITHUB_TOKEN || null,

  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
};

module.exports = config;