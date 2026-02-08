const app = require('./app');
const connectDB = require('./config/db');
const env = require('./config/env');
const logger = require('./utils/logger');

async function start() {
  // Connect to MongoDB first
  await connectDB();

  // Start Express
  app.listen(env.port, () => {
    logger.info(`Savezra server running on port ${env.port}`, {
      env: env.nodeEnv,
    });
  });
}

// Handle uncaught errors gracefully
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason: reason?.message || reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

start().catch((err) => {
  logger.error('Failed to start server', { error: err.message });
  process.exit(1);
});