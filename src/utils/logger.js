const { createLogger, format, transports } = require('winston');
const env = require('../config/env');

const logger = createLogger({
  level: env.nodeEnv === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: 'savezra' },
  transports: [
    new transports.Console({
      format:
        env.nodeEnv === 'production'
          ? format.json()
          : format.combine(format.colorize(), format.simple()),
    }),
  ],
});

module.exports = logger;