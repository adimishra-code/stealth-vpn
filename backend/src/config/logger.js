const winston = require('winston');
const env = require('./env');

// Production writes structured JSON to STDOUT only. Local files vanish when a
// container restarts, so the platform (Docker logs, CloudWatch, etc.) owns
// log persistence, rotation and retention. Development keeps pretty console.
const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'stealth-vpn' },
  transports: [
    new winston.transports.Console({
      format: env.NODE_ENV === 'development'
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, ...rest }) => {
              const meta = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
              return `${timestamp} ${level}: ${message}${meta}`;
            })
          )
        : winston.format.json(),
    }),
  ],
});

module.exports = logger;