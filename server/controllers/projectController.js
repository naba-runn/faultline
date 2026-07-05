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

  if (!name) {
    return sendError(res, 400, 'name is required');
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

  const groups = await errorGroupService.listErrorGroups(req.params.id);

  return sendSuccess(res, 200, { groups });
});

module.exports = {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  listProjectGroups,
};