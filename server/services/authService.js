const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const AppError = require('../utils/AppError');

async function login({ email, password }) {
  const user = await User.findOne({ email });

  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    throw new AppError('Invalid email or password', 401);
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
 * Registers a new user. Pure business logic — no req/res. Throws an
 * AppError for the one anticipated failure mode (duplicate email);
 * anything else (e.g. a Mongoose ValidationError from the schema)
 * propagates as-is for the central error middleware to shape (Task 20).
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
      throw new AppError('Email is already registered', 409);
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