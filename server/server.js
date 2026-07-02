const app = require('./app');
const config = require('./config/env');
const connectDB = require('./config/db');

async function start() {
  await connectDB();

  const server = app.listen(config.port, () => {
    console.log(
      `[server] Faultline API listening on port ${config.port} (${config.nodeEnv})`
    );
  });

  process.on('unhandledRejection', (err) => {
    console.error('[server] Unhandled Rejection:', err);
    server.close(() => {
      process.exit(1);
    });
  });

  process.on('uncaughtException', (err) => {
    console.error('[server] Uncaught Exception:', err);
    server.close(() => {
      process.exit(1);
    });
  });
}

start();