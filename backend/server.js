require('dotenv').config();
const env = require('./src/config/env');
const connectDB = require('./src/config/db');
const createApp = require('./src/app');
const logger = require('./src/config/logger');

const app = createApp();

async function start() {
  await connectDB();
  app.listen(env.PORT, () => {
    logger.info(`StealthVPN API listening on port ${env.PORT} [${env.NODE_ENV}]`);
  });
}

start().catch((err) => {
  logger.error('Failed to start server', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});