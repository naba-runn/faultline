const app = require('./app');
const config = require('./config/env');

const server = app.listen(config.port, () => {
  console.log(
    `[server] Faultline API listening on port ${config.port} (${config.nodeEnv})`
  );
});

// Catch unhandled promise rejections (e.g. a DB call that throws
// without being awaited/caught) so the process fails loudly instead
// of limping along in a broken state.
process.on('unhandledRejection', (err) => {
  console.error('[server] Unhandled Rejection:', err);
  server.close(() => {
    process.exit(1);
  });
});

// Catch synchronous errors that escape everything else.
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught Exception:', err);
  server.close(() => {
    process.exit(1);
  });
});

module.exports = server;