const winston = require('winston');
const env = require('./env');

// Structured JSON to STDOUT only — the platform owns log persistence and
// rotation; containers lose local files. Dev keeps the pretty console format.
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