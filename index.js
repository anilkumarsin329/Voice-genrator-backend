const mongoose = require('mongoose');
const config = require('./src/config');
const logger = require('./src/utils/logger');

config.assertValid();

const app = require('./src/app');
const bulkService = require('./src/services/bulk.service');

const start = async () => {
  await mongoose.connect(config.mongoUri);
  logger.info('MongoDB connected');
  await bulkService.markInterrupted();

  const server = app.listen(config.port, () => logger.info(`API listening on :${config.port}`, { env: config.env }));

  const shutdown = (sig) => {
    logger.info(`${sig} received, shutting down`);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

process.on('unhandledRejection', (err) => logger.error('unhandledRejection', { error: String(err?.message || err) }));

start().catch((err) => {
  logger.error('Failed to start', { error: err.message });
  process.exit(1);
});
