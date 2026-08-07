const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

async function connectDB() {
  try {
    await mongoose.connect(env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    logger.info('MongoDB connected');
  } catch (err) {
    logger.error('MongoDB connection failed', { error: err.message });
    // No DB = no service; PM2 restarts us, but only after a failed attempt is
    // worth retrying (the mongo container may still be coming up).
    // eslint-disable-next-line no-process-exit -- cannot serve without MongoDB
    process.exit(1);
  }

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error', { error: err.message });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });
}

module.exports = connectDB;