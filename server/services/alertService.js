// server/services/alertService.js
//
// Task 28.2: the actual email-sending call, kept as a small pure
// function against the Resend SDK -- same shape as aiService.js's
// callGemini (a single external-API call, no queue/retry logic of its
// own; that lives one layer up, in alertQueue.js/worker.js, same
// separation Task 25 already established between aiService.js's raw
// Gemini call and enrichmentQueue.js's retry/backoff policy).
//
// Two distinct callers construct the email content differently (new
// group vs. severity threshold crossed) -- see buildNewGroupEmail /
// buildSeverityThresholdEmail below -- but both funnel through the
// same sendAlertEmail() so there is exactly one place that touches the
// Resend SDK itself.

const { Resend } = require('resend');
const config = require('../config/env');

let client = null;
function getClient() {
  if (!client) {
    client = new Resend(config.resendApiKey);
  }
  return client;
}

/**
 * Sends an alert email via Resend. Throws on failure -- deliberately
 * not caught here, same reasoning as aiService.callGemini: retry
 * policy belongs to the queue layer (alertQueue.js's JOB_OPTIONS), not
 * this function. Returns the Resend response's id on success (not
 * currently persisted anywhere, but useful for worker log lines).
 */
async function sendAlertEmail({ to, subject, html }) {
  if (!config.resendApiKey) {
    // Same "fail loudly, don't pretend to succeed" stance as a missing
    // GEMINI_API_KEY would hit inside aiService's actual API call --
    // except Resend's SDK would only surface this deep inside an SDK
    // network error, which is a worse debugging experience than
    // catching it here with a clear message up front.
    throw new Error('RESEND_API_KEY is not configured — cannot send alert email');
  }

  const { data, error } = await getClient().emails.send({
    from: config.resendFromEmail,
    to,
    subject,
    html,
  });

  if (error) {
    // Resend's SDK returns errors in a { data, error } envelope rather
    // than throwing -- normalized into a real thrown Error here so the
    // BullMQ retry path (alertQueue.js) sees a rejected promise like it
    // does for any other job failure, not a silently-ignored envelope.
    throw new Error(`Resend API error: ${error.message || JSON.stringify(error)}`);
  }

  return data?.id || null;
}

/**
 * Builds the subject/html for a "new error group" alert. Kept as a
 * plain string-building function, not a template file/engine -- one
 * paragraph of content doesn't justify the extra dependency (see
 * PROJECT_RULES.md's restraint-over-premature-infrastructure
 * philosophy, already invoked once in tests/errorGroupService.test.js
 * for the same reason).
 */
function buildNewGroupEmail({ project, errorGroup }) {
  const subject = `[Faultline] New error in ${project.name}: ${errorGroup.message}`;
  const html = `
    <p>A new error group was created in <strong>${escapeHtml(project.name)}</strong>.</p>
    <p><strong>Message:</strong> ${escapeHtml(errorGroup.message)}</p>
    <p><a href="${dashboardUrl(project.id, errorGroup._id)}">View in Faultline</a></p>
  `.trim();
  return { subject, html };
}

/**
 * Builds the subject/html for a "severity threshold crossed" alert.
 * Only ever called once aiSummary.severity actually exists -- see
 * worker.js's processEnrichmentJob (28.3), which is the only place
 * with both an ErrorGroup's aiSummary AND the project's configured
 * threshold in scope at the same time.
 */
function buildSeverityThresholdEmail({ project, errorGroup }) {
  const severity = errorGroup.aiSummary?.severity || 'unknown';
  const subject = `[Faultline] ${severity.toUpperCase()} severity error in ${project.name}`;
  const html = `
    <p>An error group in <strong>${escapeHtml(project.name)}</strong> was rated
    <strong>${escapeHtml(severity)}</strong> severity.</p>
    <p><strong>Message:</strong> ${escapeHtml(errorGroup.message)}</p>
    ${errorGroup.aiSummary?.rootCause ? `<p><strong>Root cause:</strong> ${escapeHtml(errorGroup.aiSummary.rootCause)}</p>` : ''}
    <p><a href="${dashboardUrl(project.id, errorGroup._id)}">View in Faultline</a></p>
  `.trim();
  return { subject, html };
}

function dashboardUrl(projectId, errorGroupId) {
  return `${config.clientOrigin}/projects/${projectId}/groups/${errorGroupId}`;
}

// Minimal HTML-escaping for the handful of fields interpolated above
// (message, rootCause, project name) -- these originate from
// user-controlled error payloads (ingestController's message/stack),
// so they go into an email's HTML body the same way any
// user-controlled string going into HTML must: escaped, not trusted.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  sendAlertEmail,
  buildNewGroupEmail,
  buildSeverityThresholdEmail,
};