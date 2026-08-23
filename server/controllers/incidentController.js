// server/controllers/incidentController.js
//
// Task 41.4: GET /api/incidents/:id, PATCH /api/incidents/:id/status.
// GET /api/projects/:id/incidents lives in projectController.js
// instead — same file-per-route-prefix convention as
// GET /api/projects/:id/groups (projectController) vs
// GET /api/groups/:id (groupController).

const incidentService = require('../services/incidentService');
const { sendSuccess, sendError } = require('../utils/httpResponse');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

const VALID_STATUSES = ['open', 'investigating', 'resolved'];

// Same CastError->AppError translation pattern as groupController.js
// — a malformed :id must surface as this resource's own "Incident not
// found" 404, not the generic fallback.

const getIncidentDetail = catchAsync(async (req, res) => {
  let result;
  try {
    result = await incidentService.getIncidentDetail({
      ownerId: req.user._id,
      incidentId: req.params.id,
    });
  } catch (err) {
    if (err.name === 'CastError') {
      throw new AppError('Incident not found', 404);
    }
    throw err;
  }

  if (!result) {
    return sendError(res, 404, 'Incident not found');
  }

  return sendSuccess(res, 200, result);
});

const updateStatus = catchAsync(async (req, res) => {
  const { status } = req.body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return sendError(res, 400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  let incident;
  try {
    incident = await incidentService.updateIncidentStatus({
      ownerId: req.user._id,
      incidentId: req.params.id,
      status,
    });
  } catch (err) {
    if (err.name === 'CastError') {
      throw new AppError('Incident not found', 404);
    }
    throw err;
  }

  if (!incident) {
    return sendError(res, 404, 'Incident not found');
  }

  return sendSuccess(res, 200, { incident });
});

module.exports = { getIncidentDetail, updateStatus };
