const env = require('./env');
const logger = require('./logger');

let redis = null;
let redlock = null;

if (env.REDIS_URL) {
  const Redis = require('ioredis');
  const Redlock = require('redlock');

  redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });

  redis.on('error', (err) => {
    logger.error('Redis connection error', { error: err.message });
  });

  redlock = new Redlock([redis], {
    driftFactor: 0.01,
    retryCount: 10,
    retryDelay: 200,
    retryJitter: 100,
    automaticExtensionThreshold: 500,
  });

  logger.info('Redis/Redlock initialized', { url: env.REDIS_URL.replace(/\/\/.*@/, '//***@') });
}

module.exports = { redis, redlock };
