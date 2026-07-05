const projectService = require('../services/projectService');
const errorGroupService = require('../services/errorGroupService');
const { sendSuccess, sendError } = require('../utils/httpResponse');

async function createProject(req, res) {
  try {
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
  } catch (err) {
    if (err.name === 'ValidationError') {
      return sendError(
        res,
        400,
        Object.values(err.errors)
          .map((e) => e.message)
          .join(', ')
      );
    }
    const statusCode = err.statusCode || 500;
    return sendError(res, statusCode, err.message || 'Internal Server Error');
  }
}

async function getProject(req, res) {
  try {
    const project = await projectService.getProject({
      ownerId: req.user._id,
      projectId: req.params.id,
    });

    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    return sendSuccess(res, 200, { project });
  } catch (err) {
    if (err.name === 'CastError') {
      return sendError(res, 404, 'Project not found');
    }
    const statusCode = err.statusCode || 500;
    return sendError(res, statusCode, err.message || 'Internal Server Error');
  }
}

async function updateProject(req, res) {
  try {
    const { name, githubRepo } = req.body;

    const project = await projectService.updateProject({
      ownerId: req.user._id,
      projectId: req.params.id,
      name,
      githubRepo,
    });

    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    return sendSuccess(res, 200, { project });
  } catch (err) {
    if (err.name === 'CastError') {
      return sendError(res, 404, 'Project not found');
    }
    if (err.name === 'ValidationError') {
      return sendError(
        res,
        400,
        Object.values(err.errors)
          .map((e) => e.message)
          .join(', ')
      );
    }
    const statusCode = err.statusCode || 500;
    return sendError(res, statusCode, err.message || 'Internal Server Error');
  }
}

async function deleteProject(req, res) {
  try {
    const deleted = await projectService.deleteProject({
      ownerId: req.user._id,
      projectId: req.params.id,
    });

    if (!deleted) {
      return sendError(res, 404, 'Project not found');
    }

    // 204 No Content — no JSON body, so this deliberately doesn't go
    // through sendSuccess (which always emits a { success, data }
    // JSON body). Response shape unchanged from before this refactor.
    return res.status(204).send();
  } catch (err) {
    if (err.name === 'CastError') {
      return sendError(res, 404, 'Project not found');
    }
    const statusCode = err.statusCode || 500;
    return sendError(res, statusCode, err.message || 'Internal Server Error');
  }
}


async function listProjects(req, res) {
  try {
    const projects = await projectService.listProjects(req.user._id);

    return sendSuccess(res, 200, { projects });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return sendError(res, statusCode, err.message || 'Internal Server Error');
  }
}

async function listProjectGroups(req, res) {
  try {
    // Ownership check first, same pattern as getProject/updateProject/
    // deleteProject: not-found and not-yours collapse to the same 404
    // (see DECISIONS.md) — reusing getProject here rather than
    // duplicating that Project.findOne({ _id, ownerId }) query.
    const project = await projectService.getProject({
      ownerId: req.user._id,
      projectId: req.params.id,
    });

    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    const groups = await errorGroupService.listErrorGroups(req.params.id);

    return sendSuccess(res, 200, { groups });
  } catch (err) {
    if (err.name === 'CastError') {
      return sendError(res, 404, 'Project not found');
    }
    const statusCode = err.statusCode || 500;
    return sendError(res, statusCode, err.message || 'Internal Server Error');
  }
}

module.exports = {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  listProjectGroups,
};