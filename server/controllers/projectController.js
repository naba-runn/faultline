const crypto = require('crypto');
const projectService = require('../services/projectService');
const errorGroupService = require('../services/errorGroupService');
const { enqueueEnrichment } = require('../services/enrichmentQueue');
const sseHub = require('../services/sseHub');
const { getRedisConnection } = require('../config/redis');
const { sendSuccess, sendError } = require('../utils/httpResponse');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// Task 26: ticket TTL for the SSE stream endpoint. Short and
// single-use deliberately — see routes/sseRoutes.js and
// DECISIONS.md's "Task 26" entry for why a ticket exists at all
// (native EventSource can't send an Authorization header, and this
// app's morgan request logging means a JWT-in-query-string would be a
// real credential leak; a ticket that's dead within seconds and only
// works once bounds the exposure of putting *something* in a URL).
const SSE_TICKET_TTL_SECONDS = 30;

// Task 23: a small, fixed set of canned synthetic errors for the
// dashboard's "Simulate Error" button. Deliberately not user-supplied
// free text -- this reuses the exact same recordEvent/enrichErrorGroup
// services the real POST /api/events path uses (see simulateError
// below), just reached via JWT ownership auth instead of an API key,
// so the payload shape needs to look like a real client error, not an
// open text field.
const CANNED_ERRORS = [
  {
    message: "Cannot read properties of undefined (reading 'id')",
    stack:
      "TypeError: Cannot read properties of undefined (reading 'id')\n    at getUserId (/app/src/services/userService.js:42:18)\n    at processRequest (/app/src/controllers/userController.js:17:22)",
  },
  {
    message: 'Simulated payment processing failure',
    stack:
      'Error: Simulated payment processing failure\n    at chargeCard (/app/src/services/paymentService.js:88:11)\n    at checkout (/app/src/controllers/orderController.js:31:9)',
  },
  {
    message: 'Invalid array length',
    stack:
      'RangeError: Invalid array length\n    at buildPage (/app/src/utils/pagination.js:14:20)\n    at listItems (/app/src/controllers/itemController.js:9:16)',
  },
];

// catchAsync forwards any rejection to the central error middleware —
// see middleware/errorMiddleware.js. A malformed :id surfaces as a
// Mongoose CastError; that's caught locally (not centrally) so the
// resource-specific "Project not found" message is preserved — only
// the controller layer knows which resource name to use, so this one
// piece of translation stays here rather than moving to the generic
// central handler (which would otherwise fall back to a generic
// "Resource not found").

const createProject = catchAsync(async (req, res) => {
  const { name, githubRepo } = req.body;

  // typeof check alongside truthiness, same reasoning as Task 20.3's
  // pass on authController: a truthy-but-non-string name (e.g. an
  // object) would otherwise reach Project.create() unguarded — see
  // DECISIONS.md's "Auth input validation" entry, which this extends
  // to the project endpoints.
  if (!name || typeof name !== 'string') {
    return sendError(res, 400, 'name is required');
  }

  if (githubRepo !== undefined && githubRepo !== null && typeof githubRepo !== 'string') {
    return sendError(res, 400, 'githubRepo must be a string');
  }

  const { project, apiKey } = await projectService.createProject({
    ownerId: req.user._id,
    name,
    githubRepo,
  });

  return sendSuccess(res, 201, { project, apiKey });
});

const getProject = catchAsync(async (req, res) => {
  let project;
  try {
    project = await projectService.getProject({
      ownerId: req.user._id,
      projectId: req.params.id,
    });
  } catch (err) {
    if (err.name === 'CastError') {
      throw new AppError('Project not found', 404);
    }
    throw err;
  }

  if (!project) {
    return sendError(res, 404, 'Project not found');
  }

  return sendSuccess(res, 200, { project });
});

const updateProject = catchAsync(async (req, res) => {
  const { name, githubRepo } = req.body;

  // Previously unvalidated entirely — name/githubRepo went straight
  // to projectService with only the schema's own validators as a
  // backstop. Added as part of Task 20.3: same typeof-guard pattern
  // as createProject above (and authController before it), applied
  // only to fields that were actually provided — omitting a field
  // here still means "leave it unchanged" (see projectService.js).
  if (name !== undefined && (typeof name !== 'string' || !name)) {
    return sendError(res, 400, 'name must be a non-empty string');
  }

  if (githubRepo !== undefined && githubRepo !== null && typeof githubRepo !== 'string') {
    return sendError(res, 400, 'githubRepo must be a string');
  }

  let project;
  try {
    project = await projectService.updateProject({
      ownerId: req.user._id,
      projectId: req.params.id,
      name,
      githubRepo,
    });
  } catch (err) {
    if (err.name === 'CastError') {
      throw new AppError('Project not found', 404);
    }
    throw err;
  }

  if (!project) {
    return sendError(res, 404, 'Project not found');
  }

  return sendSuccess(res, 200, { project });
});

const deleteProject = catchAsync(async (req, res) => {
  let deleted;
  try {
    deleted = await projectService.deleteProject({
      ownerId: req.user._id,
      projectId: req.params.id,
    });
  } catch (err) {
    if (err.name === 'CastError') {
      throw new AppError('Project not found', 404);
    }
    throw err;
  }

  if (!deleted) {
    return sendError(res, 404, 'Project not found');
  }

  // 204 No Content — no JSON body, so this deliberately doesn't go
  // through sendSuccess (which always emits a { success, data } JSON
  // body). Response shape unchanged from before this refactor.
  return res.status(204).send();
});

const listProjects = catchAsync(async (req, res) => {
  const projects = await projectService.listProjects(req.user._id);

  return sendSuccess(res, 200, { projects });
});

const listProjectGroups = catchAsync(async (req, res) => {
  // Ownership check first, same pattern as getProject/updateProject/
  // deleteProject: not-found and not-yours collapse to the same 404
  // (see DECISIONS.md) — reusing getProject here rather than
  // duplicating that Project.findOne({ _id, ownerId }) query.
  let project;
  try {
    project = await projectService.getProject({
      ownerId: req.user._id,
      projectId: req.params.id,
    });
  } catch (err) {
    if (err.name === 'CastError') {
      throw new AppError('Project not found', 404);
    }
    throw err;
  }

  if (!project) {
    return sendError(res, 404, 'Project not found');
  }

  let result;
  try {
    result = await errorGroupService.listErrorGroups(req.params.id, {
      limit: req.query.limit,
      cursor: req.query.cursor,
    });
  } catch (err) {
    if (err.message === 'INVALID_CURSOR') {
      return sendError(res, 400, 'cursor is invalid or malformed');
    }
    if (err.message === 'INVALID_LIMIT') {
      return sendError(res, 400, 'limit must be a positive integer');
    }
    throw err;
  }

  return sendSuccess(res, 200, result);
});

// Task 23: lets a logged-in dashboard user (JWT) trigger a synthetic
// error against a project they own, without needing that project's
// raw API key (which is only ever shown once, at creation, and never
// stored in retrievable form -- see projectService.createProject).
// Ownership is checked the same way as listProjectGroups above --
// reuses projectService.getProject rather than duplicating the
// Project.findOne({ _id, ownerId }) query.
//
// Deliberately calls the exact same errorGroupService.recordEvent
// the real POST /api/events ingestion path uses (see
// ingestController.ingestEvent) -- no new dedup/fingerprint logic is
// introduced here, only a new auth path into the existing pipeline.
// One of a small fixed set of canned errors is chosen at random each
// call so repeated clicks can demonstrate both a brand-new ErrorGroup
// (fresh AI enrichment) and a duplicate (count bump, no new
// enrichment) depending on which one lands.
//
// Task 25: enqueues via the same enrichmentQueue.enqueueEnrichment
// used by real ingestion, rather than calling
// errorGroupService.enrichErrorGroup directly -- simulated errors get
// the same retry/backoff and worker-process handling as real ones,
// not a second, inconsistent enrichment path.
const simulateError = catchAsync(async (req, res) => {
  let project;
  try {
    project = await projectService.getProject({
      ownerId: req.user._id,
      projectId: req.params.id,
    });
  } catch (err) {
    if (err.name === 'CastError') {
      throw new AppError('Project not found', 404);
    }
    throw err;
  }

  if (!project) {
    return sendError(res, 404, 'Project not found');
  }

  const canned = CANNED_ERRORS[Math.floor(Math.random() * CANNED_ERRORS.length)];

  const { errorGroup, isNewGroup } = await errorGroupService.recordEvent({
    projectId: project.id,
    message: canned.message,
    stack: canned.stack,
    env: 'simulated',
    metadata: { source: 'dashboard-simulate-button' },
  });

  sendSuccess(res, 202, {
    received: true,
    projectId: project.id,
    errorGroupId: errorGroup._id,
    isNewGroup,
  });

  if (isNewGroup) {
    // Bug found via manual testing (see DECISIONS.md's "Duplicate
    // events never pushed a live update" entry): this function
    // previously never published any SSE event at all, unlike
    // ingestController's real ingestion path. A new group created via
    // this button only ever appeared to sync live by coincidence --
    // via the *separate*, delayed enrichment_completed event a worker
    // publishes once AI enrichment finishes seconds later, not from
    // this button press itself. Fixed to match ingestController's
    // pattern exactly, so both paths behave identically.
    sseHub.publish(project.id, 'new_group', { errorGroupId: errorGroup._id }).catch((err) => {
      console.error(`[simulateError] failed to publish SSE event for group ${errorGroup._id}:`, err.message);
    });

    // Task 25: same enqueue-not-call-directly pattern as
    // ingestController -- see that file's doc comment for why a queue
    // failure is caught here rather than left to propagate (the
    // response has already been sent by this point).
    enqueueEnrichment({
      errorGroupId: errorGroup._id,
      projectId: project.id,
      message: canned.message,
      stack: canned.stack,
    }).catch((err) => {
      console.error(`[simulateError] failed to enqueue enrichment job for group ${errorGroup._id}:`, err.message);
    });
  } else {
    // Same duplicate-case gap as ingestController, same fix.
    sseHub.publish(project.id, 'duplicate_recorded', {
      errorGroupId: errorGroup._id,
      count: errorGroup.count,
    }).catch((err) => {
      console.error(`[simulateError] failed to publish SSE event for group ${errorGroup._id}:`, err.message);
    });
  }
});

// Task 26: mints a short-lived, single-use ticket authorizing an SSE
// connection to this project's event stream. JWT-authed and
// ownership-checked exactly like every other project route (reuses
// projectService.getProject) -- the ownership decision is made HERE,
// once, at mint time; the stream endpoint itself
// (routes/sseRoutes.js) trusts whatever project ID is embedded in a
// valid ticket rather than re-deriving ownership, since it has no
// JWT to check against in the first place. See DECISIONS.md's "Task
// 26" entry for the full reasoning on why a ticket exists instead of
// putting the JWT directly in the stream URL.
const mintSseTicket = catchAsync(async (req, res) => {
  let project;
  try {
    project = await projectService.getProject({
      ownerId: req.user._id,
      projectId: req.params.id,
    });
  } catch (err) {
    if (err.name === 'CastError') {
      throw new AppError('Project not found', 404);
    }
    throw err;
  }

  if (!project) {
    return sendError(res, 404, 'Project not found');
  }

  const ticket = crypto.randomBytes(24).toString('hex');
  await getRedisConnection().set(
    `sse:ticket:${ticket}`,
    JSON.stringify({ userId: String(req.user._id), projectId: project.id }),
    'EX',
    SSE_TICKET_TTL_SECONDS
  );

  sendSuccess(res, 201, { ticket, expiresInSeconds: SSE_TICKET_TTL_SECONDS });
});

module.exports = {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  listProjectGroups,
  simulateError,
  mintSseTicket,
};