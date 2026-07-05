const projectService = require('../services/projectService');
const errorGroupService = require('../services/errorGroupService');
const { sendSuccess, sendError } = require('../utils/httpResponse');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

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

module.exports = {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  listProjectGroups,
};