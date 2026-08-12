const catchAsync = require('../utils/catchAsync');
const { sendSuccess, sendError } = require('../utils/httpResponse');
const projectService = require('../services/projectService');
const sourceMapService = require('../services/sourceMapService');

/**
 * Uploads (or overwrites) a source map for a project.
 * Supports both JWT user auth (via :id in URL) and API key auth (via req.project).
 */
const uploadSourceMap = catchAsync(async (req, res) => {
  let projectId;

  if (req.project) {
    // Authenticated via API key (apiKeyMiddleware)
    projectId = req.project._id;
  } else if (req.user) {
    // Authenticated via JWT (authMiddleware)
    projectId = req.params.id;
    const project = await projectService.getProject({
      ownerId: req.user.id,
      projectId,
    });
    if (!project) {
      return sendError(res, 404, 'Project not found');
    }
  } else {
    return sendError(res, 401, 'Not authorized');
  }

  const { filename, release, map } = req.body;

  if (!filename || typeof filename !== 'string') {
    return sendError(res, 400, 'filename is required and must be a string');
  }

  if (!map) {
    return sendError(res, 400, 'map is required');
  }

  const sourceMap = await sourceMapService.uploadSourceMap({
    projectId,
    filename,
    release,
    map,
  });

  return sendSuccess(res, 201, { sourceMap });
});

/**
 * Lists metadata for all uploaded source maps of a project.
 */
const listSourceMaps = catchAsync(async (req, res) => {
  const projectId = req.params.id;
  const project = await projectService.getProject({
    ownerId: req.user.id,
    projectId,
  });

  if (!project) {
    return sendError(res, 404, 'Project not found');
  }

  const sourceMaps = await sourceMapService.listSourceMaps(projectId);
  return sendSuccess(res, 200, { sourceMaps });
});

/**
 * Deletes a source map by ID.
 */
const deleteSourceMap = catchAsync(async (req, res) => {
  const projectId = req.params.id;
  const { mapId } = req.params;

  const project = await projectService.getProject({
    ownerId: req.user.id,
    projectId,
  });

  if (!project) {
    return sendError(res, 404, 'Project not found');
  }

  await sourceMapService.deleteSourceMap({ projectId, mapId });
  return sendSuccess(res, 200, { deleted: true });
});

module.exports = {
  uploadSourceMap,
  listSourceMaps,
  deleteSourceMap,
};
