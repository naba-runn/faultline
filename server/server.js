const app = require('./app');
const config = require('./config/env');
const connectDB = require('./config/db');
const { startWorkers } = require('./workerStart');

async function start() {
  await connectDB();

  const server = app.listen(config.port, () => {
    console.log(
      `[server] Faultline API listening on port ${config.port} (${config.nodeEnv})`
    );
  });

  const workers = startWorkers();

  function shutdown(label, err) {
    console.error(`[server] ${label}:`, err);
    Promise.all([
      workers.worker.close(),
      workers.alertWorker.close(),
      workers.deploymentCorrelationWorker.close(),
      workers.incidentDiagnosisWorker.close(),
    ]).finally(() => {
      server.close(() => {
        process.exit(1);
      });
    });
  }

  process.on('unhandledRejection', (err) => shutdown('Unhandled Rejection', err));
  process.on('uncaughtException', (err) => shutdown('Uncaught Exception', err));
}

start();
