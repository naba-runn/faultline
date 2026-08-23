// server/controllers/webhookController.js
//
// Task 40.2: GitHub deployment_status webhook receiver. Public route
// (no JWT, no API key — see routes/webhookRoutes.js), authenticated
// instead by verifying GitHub's HMAC-SHA256 payload signature against
// the shared GITHUB_WEBHOOK_SECRET (DECISIONS.md, "Task 40: Webhook
// secret — one global env var, not per-project").
//
// Order of checks, deliberately: verify signature FIRST (reject
// forged payloads before touching the DB or even fully parsing
// business fields), THEN Project.findById + 404 on miss. A shared
// secret proves "this request came from GitHub," not "this
// :projectId is a real project" — those are two different questions,
// checked in that order because the first one is cheap and closes off
// forgery before the second one does any DB work at all.

const crypto = require('crypto');
const config = require('../config/env');
const Project = require('../models/Project');
const deploymentService = require('../services/deploymentService');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess, sendError } = require('../utils/httpResponse');

/**
 * Verifies `X-Hub-Signature-256: sha256=<hex>` against the raw request
 * body (see app.js's dedicated json({ verify }) mount for this route
 * — HMAC must be computed over the exact bytes GitHub sent, not a
 * re-serialized `JSON.stringify(req.body)`, which can differ in key
 * order/whitespace and would make every signature check fail).
 * `crypto.timingSafeEqual`, not `===` — same enumeration/timing-attack
 * avoidance reasoning as apiKeyMiddleware's hash comparison, applied
 * here to a signature instead of a key hash.
 */
function isValidSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  if (!rawBody) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(`sha256=${expected}`, 'utf8');
  const actualBuf = Buffer.from(signatureHeader, 'utf8');

  // timingSafeEqual throws on length mismatch rather than returning
  // false — guard explicitly, since a signature of the wrong length
  // is a normal "invalid" case here, not a program error.
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Handles GitHub's `deployment_status` webhook event. Only acts on
 * `deployment_status.state === 'success'` (Task 40.2's spec) — every
 * other state (pending, failure, error, inactive, queued, in_progress)
 * is acknowledged with 200 and ignored, not rejected: GitHub retries
 * webhook deliveries that receive non-2xx responses, and there's
 * nothing wrong with a non-success status update, it's just not one
 * this feature tracks.
 */
const receiveGithubDeployment = catchAsync(async (req, res) => {
  if (!config.githubWebhookSecret) {
    // Feature not configured at all — reject clearly rather than
    // pretending to verify against an empty/undefined secret (which
    // would make isValidSignature's HMAC comparison meaningless).
    return sendError(res, 503, 'GitHub deployment webhook is not configured on this server');
  }

  const signatureHeader = req.headers['x-hub-signature-256'];
  if (!isValidSignature(req.rawBody, signatureHeader, config.githubWebhookSecret)) {
    return sendError(res, 401, 'Invalid webhook signature');
  }

  const project = await Project.findById(req.params.projectId).select('_id');
  if (!project) {
    return sendError(res, 404, 'Project not found');
  }

  const payload = req.body || {};
  const status = payload.deployment_status?.state;

  if (status !== 'success') {
    // Acknowledged, not acted on — see doc comment above.
    return sendSuccess(res, 200, { recorded: false, reason: `ignored deployment_status.state="${status}"` });
  }

  const sha = payload.deployment?.sha;
  const ref = payload.deployment?.ref || null;
  if (!sha || typeof sha !== 'string') {
    return sendError(res, 400, 'deployment.sha is required in a deployment_status success payload');
  }

  const deployedAt = payload.deployment_status?.updated_at
    ? new Date(payload.deployment_status.updated_at)
    : new Date();

  const deployment = await deploymentService.recordDeployment({
    projectId: project._id,
    sha,
    ref,
    deployedAt,
    source: 'github-webhook',
  });

  return sendSuccess(res, 201, {
    recorded: true,
    deployment: { id: deployment._id, sha: deployment.sha, ref: deployment.ref, deployedAt: deployment.deployedAt },
  });
});

module.exports = { receiveGithubDeployment, isValidSignature };
