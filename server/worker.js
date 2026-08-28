// Standalone worker entry point — run with: node worker.js
// Uses the same shared logic as server.js's embedded workers
// (workerStart.js), but in its own process with its own DB connection.
// For production single-service deployment, server.js embeds the
// workers directly. This standalone mode is for local development
// or scaled deployments where workers run as a separate service.

const connectDB = require('./config/db');
const { startWorkers } = require('./workerStart');

async function start() {
  await connectDB();

  const workers = startWorkers();

  function shutdown(label, err) {
    console.error(`[worker] ${label}:`, err);
    Promise.all([
      workers.worker.close(),
      workers.alertWorker.close(),
      workers.deploymentCorrelationWorker.close(),
      workers.incidentDiagnosisWorker.close(),
    ]).finally(() => process.exit(1));
  }

  process.on('unhandledRejection', (err) => shutdown('Unhandled Rejection', err));
  process.on('uncaughtException', (err) => shutdown('Uncaught Exception', err));
}

start();
