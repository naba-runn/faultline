const User = require('../models/User');
const generateToken = require('../utils/generateToken');

async function login({ email, password }) {
  const user = await User.findOne({ email });

  if (!user) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  const token = generateToken(user._id);

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    },
    token,
  };
}



/**
 * Registers a new user. Pure business logic — no req/res. Throws a
 * plain Error with a .statusCode the controller knows how to map;
 * this is intentionally simple until Task 20 introduces AppError.
 */
async function register({ name, email, password }) {
  let user;
  try {
    // passwordHash receives the plaintext password here — the User
    // model's pre-save hook hashes it before persistence (see
    // DECISIONS.md for why hashing lives in the model).
    user = await User.create({ name, email, passwordHash: password });
  } catch (err) {
    if (err.code === 11000) {
      const dupError = new Error('Email is already registered');
      dupError.statusCode = 409;
      throw dupError;
    }
    throw err;
  }

  const token = generateToken(user._id);

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    },
    token,
  };
}

module.exports = { register, login };