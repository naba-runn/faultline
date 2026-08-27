const { Worker } = require('bullmq');
const { getBullConnection } = require('./config/redis');
const { QUEUE_NAME } = require('./services/enrichmentQueue');
const { QUEUE_NAME: ALERT_QUEUE_NAME } = require('./services/alertQueue');
const { QUEUE_NAME: DEPLOYMENT_CORRELATION_QUEUE_NAME } = require('./services/deploymentCorrelationQueue');
const { QUEUE_NAME: INCIDENT_DIAGNOSIS_QUEUE_NAME } = require('./services/incidentDiagnosisQueue');
const { enrichErrorGroup, computeGroupTrend } = require('./services/errorGroupService');
const deploymentService = require('./services/deploymentService');
const alertService = require('./services/alertService');
const aiService = require('./services/aiService');
const sseHub = require('./services/sseHub');
const ErrorGroup = require('./models/ErrorGroup');
const Project = require('./models/Project');
const Deployment = require('./models/Deployment');
const Incident = require('./models/Incident');
const { enqueueSeverityThresholdAlert } = require('./services/alertQueue');
const config = require('./config/env');

const SEVERITY_ORDER = ['low', 'medium', 'high', 'critical'];

async function processEnrichmentJob(job) {
  const { errorGroupId, projectId, message, stack } = job.data;

  const errorGroup = await ErrorGroup.findById(errorGroupId);
  if (!errorGroup) {
    console.warn(`[worker] ErrorGroup ${errorGroupId} no longer exists — skipping job ${job.id}`);
    return;
  }

  const project = await Project.findById(projectId);

  await enrichErrorGroup({ errorGroup, project, message, stack });

  if (project?.alertConfig?.severityThreshold?.enabled) {
    const freshErrorGroup = await ErrorGroup.findById(errorGroupId);
    const severity = freshErrorGroup?.aiSummary?.severity;
    const minSeverity = project.alertConfig.severityThreshold.minSeverity;

    if (severity && SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf(minSeverity)) {
      enqueueSeverityThresholdAlert({ errorGroupId, projectId }).catch((err) => {
        console.error(`[worker] failed to enqueue severity-threshold alert for group ${errorGroupId}:`, err.message);
      });
    }
  }

  await sseHub.publish(projectId, 'enrichment_completed', { errorGroupId }).catch((err) => {
    console.error(`[worker] failed to publish SSE event for group ${errorGroupId}:`, err.message);
  });
}

async function processAlertJob(job) {
  const { kind, errorGroupId, projectId } = job.data;

  const errorGroup = await ErrorGroup.findById(errorGroupId);
  const project = await Project.findById(projectId);

  if (!errorGroup || !project) {
    console.warn(`[worker] alert job ${job.id}: group or project no longer exists — skipping`);
    return;
  }

  const recipient = project.alertConfig?.email;
  if (!recipient) {
    console.warn(`[worker] alert job ${job.id}: no recipient configured for project ${projectId} — skipping`);
    return;
  }

  let emailContent;
  if (kind === 'severityThreshold') {
    emailContent = alertService.buildSeverityThresholdEmail({ project, errorGroup });
  } else if (kind === 'spike') {
    const trend = await computeGroupTrend(errorGroup);
    emailContent = alertService.buildSpikeAlertEmail({ project, errorGroup, trend });
  } else {
    emailContent = alertService.buildNewGroupEmail({ project, errorGroup });
  }
  const { subject, html } = emailContent;

  await alertService.sendAlertEmail({ to: recipient, subject, html });
}

async function processDeploymentCorrelationJob(job) {
  const { deploymentId } = job.data;
  await deploymentService.correlateDeployment(deploymentId);
}

async function processIncidentDiagnosisJob(job) {
  const { incidentId } = job.data;

  const incident = await Incident.findById(incidentId);
  if (!incident) {
    console.warn(`[worker] Incident ${incidentId} no longer exists — skipping job ${job.id}`);
    return;
  }

  const affectedGroups = await ErrorGroup.find({ _id: { $in: incident.affectedGroups } })
    .select('message aiSummary.rootCause aiSummary.severity');

  if (affectedGroups.length === 0) {
    console.warn(`[worker] Incident ${incidentId} has no affected groups — skipping diagnosis`);
    return;
  }

  let deployment = null;
  if (incident.triggeredBy?.type === 'deployment' && incident.triggeredBy.refId) {
    deployment = await Deployment.findById(incident.triggeredBy.refId).select('sha ref deployedAt');
  }

  const prompt = aiService.buildIncidentDiagnosisPrompt({
    affectedGroups: affectedGroups.map((g) => ({
      message: g.message,
      severity: g.aiSummary?.severity || null,
      rootCause: g.aiSummary?.rootCause || null,
    })),
    deployment,
  });

  const rawResponse = await aiService.callGeminiText(prompt);
  const hypothesis = aiService.validateIncidentHypothesis(rawResponse);

  if (!hypothesis) {
    console.warn(`[worker] Incident ${incidentId}: AI diagnosis returned no usable hypothesis — leaving aiSummary null`);
    return;
  }

  await Incident.findByIdAndUpdate(incidentId, {
    $set: { aiSummary: hypothesis },
    $push: { timeline: { type: 'ai_diagnosis', message: 'AI diagnosis generated.', timestamp: new Date() } },
  });

  await sseHub.publish(incident.projectId, 'incident_updated', { incidentId: incident._id }).catch((err) => {
    console.error(`[worker] failed to publish SSE event for incident ${incidentId}:`, err.message);
  });
}

function startWorkers() {
  const connection = getBullConnection();

  const worker = new Worker(QUEUE_NAME, processEnrichmentJob, { connection });
  const alertWorker = new Worker(ALERT_QUEUE_NAME, processAlertJob, { connection });
  const deploymentCorrelationWorker = new Worker(DEPLOYMENT_CORRELATION_QUEUE_NAME, processDeploymentCorrelationJob, { connection });
  const incidentDiagnosisWorker = new Worker(INCIDENT_DIAGNOSIS_QUEUE_NAME, processIncidentDiagnosisJob, { connection });

  worker.on('failed', (job, err) => {
    console.error(`[worker] job ${job.id} (group ${job.data.errorGroupId}) failed (attempt ${job.attemptsMade}/${job.opts.attempts}):`, err.message);
  });
  worker.on('completed', (job) => {
    console.log(`[worker] job ${job.id} (group ${job.data.errorGroupId}) completed`);
  });

  alertWorker.on('failed', (job, err) => {
    console.error(`[worker] alert job ${job.id} (${job.data.kind}, group ${job.data.errorGroupId}) failed (attempt ${job.attemptsMade}/${job.opts.attempts}):`, err.message);
  });
  alertWorker.on('completed', (job) => {
    console.log(`[worker] alert job ${job.id} (${job.data.kind}, group ${job.data.errorGroupId}) completed`);
  });

  deploymentCorrelationWorker.on('failed', (job, err) => {
    console.error(`[worker] deployment-correlation job ${job.id} (deployment ${job.data.deploymentId}) failed (attempt ${job.attemptsMade}/${job.opts.attempts}):`, err.message);
  });
  deploymentCorrelationWorker.on('completed', (job) => {
    console.log(`[worker] deployment-correlation job ${job.id} (deployment ${job.data.deploymentId}) completed`);
  });

  incidentDiagnosisWorker.on('failed', (job, err) => {
    console.error(`[worker] incident-diagnosis job ${job.id} (incident ${job.data.incidentId}) failed (attempt ${job.attemptsMade}/${job.opts.attempts}):`, err.message);
  });
  incidentDiagnosisWorker.on('completed', (job) => {
    console.log(`[worker] incident-diagnosis job ${job.id} (incident ${job.data.incidentId}) completed`);
  });

  console.log(`[worker] Faultline enrichment worker listening on queue "${QUEUE_NAME}" (${config.nodeEnv})`);
  console.log(`[worker] Faultline alert worker listening on queue "${ALERT_QUEUE_NAME}" (${config.nodeEnv})`);
  console.log(`[worker] Faultline deployment-correlation worker listening on queue "${DEPLOYMENT_CORRELATION_QUEUE_NAME}" (${config.nodeEnv})`);
  console.log(`[worker] Faultline incident-diagnosis worker listening on queue "${INCIDENT_DIAGNOSIS_QUEUE_NAME}" (${config.nodeEnv})`);

  return { worker, alertWorker, deploymentCorrelationWorker, incidentDiagnosisWorker };
}

module.exports = { startWorkers };
