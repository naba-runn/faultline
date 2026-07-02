const mongoose = require('mongoose');
const config = require('./env');

async function connectDB() {
  try {
    await mongoose.connect(config.mongodbUri);
    console.log(`[db] MongoDB connected: ${mongoose.connection.host}`);
  } catch (err) {
    console.error('[db] MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('[db] MongoDB disconnected');
});

module.exports = connectDB;