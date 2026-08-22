const catchAsync = require('../utils/catchAsync');
const { sendSuccess, sendError } = require('../utils/httpResponse');
const projectService = require('../services/projectService');
const sourceMapService = require('../services/sourceMapService');
const AppError = require('../utils/AppError');

/**
 * Uploads (or overwrites) a source map for a project.
 * Supports both JWT user auth (via :id in URL) and API key auth (via req.project).
 *
 * Same CastError->AppError translation as every other project-scoped
 * controller (see projectController.js) -- a malformed :id must still
 * surface as this resource's own "Project not found" 404, not the
 * generic "Resource not found" errorMiddleware falls back to for
 * anything a controller doesn't translate itself.
 */
const uploadSourceMap = catchAsync(async (req, res) => {
  let projectId;

  if (req.project) {
    // Authenticated via API key (apiKeyMiddleware) -- req.project was
    // already resolved from a hashed key lookup, so there's no :id to
    // cast and nothing to translate here.
    //
    // The URL still carries its own :id (this route is
    // POST /:id/sourcemaps regardless of auth method) -- if it
    // doesn't match the key's own project, reject rather than
    // silently uploading to whichever project the key belongs to. The
    // key can never write outside its own project either way (that
    // part was already safe), but silently substituting a different
    // project than the URL named would return 201 for a request that,
    // from the caller's point of view, targeted the wrong resource --
    // easy to mask a misconfigured build step (wrong key checked into
    // a different project's CI) as a false "success."
    if (req.params.id && String(req.project._id) !== String(req.params.id)) {
      return sendError(res, 403, 'API key does not match the project in the URL');
    }
    projectId = req.project._id;
  } else if (req.user) {
    // Authenticated via JWT (authMiddleware)
    projectId = req.params.id;
    let project;
    try {
      project = await projectService.getProject({
        ownerId: req.user.id,
        projectId,
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
  let project;
  try {
    project = await projectService.getProject({
      ownerId: req.user.id,
      projectId,
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

  const sourceMaps = await sourceMapService.listSourceMaps(projectId);
  return sendSuccess(res, 200, { sourceMaps });
});

/**
 * Deletes a source map by ID.
 */
const deleteSourceMap = catchAsync(async (req, res) => {
  const projectId = req.params.id;
  const { mapId } = req.params;

  let project;
  try {
    project = await projectService.getProject({
      ownerId: req.user.id,
      projectId,
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

  await sourceMapService.deleteSourceMap({ projectId, mapId });
  return sendSuccess(res, 200, { deleted: true });
});

module.exports = {
  uploadSourceMap,
  listSourceMaps,
  deleteSourceMap,
};