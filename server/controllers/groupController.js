const errorGroupService = require('../services/errorGroupService');
const { sendSuccess, sendError } = require('../utils/httpResponse');

// Same three values as the ErrorGroup schema's `status` enum
// (server/models/ErrorGroup.js) — kept in sync manually since there's
// no shared constants module yet (premature abstraction for one enum
// used in exactly two places; see PROJECT_RULES.md §11).
const VALID_STATUSES = ['open', 'resolved', 'ignored'];

async function updateStatus(req, res) {
    try {
        const { status } = req.body;

        if (!status || !VALID_STATUSES.includes(status)) {
            return sendError(res, 400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
        }

        const group = await errorGroupService.updateGroupStatus({
            ownerId: req.user._id,
            groupId: req.params.id,
            status,
        });

        if (!group) {
            return sendError(res, 404, 'Error group not found');
        }

        return sendSuccess(res, 200, { group });
    } catch (err) {
        // Malformed :id (not a valid ObjectId) — same not-found collapse
        // as every other resource route in this codebase.
        if (err.name === 'CastError') {
            return sendError(res, 404, 'Error group not found');
        }
        const statusCode = err.statusCode || 500;
        return sendError(res, statusCode, err.message || 'Internal Server Error');
    }
}

async function getGroupDetail(req, res) {
    try {
        const result = await errorGroupService.getGroupDetail({
            ownerId: req.user._id,
            groupId: req.params.id,
        });

        if (!result) {
            return sendError(res, 404, 'Error group not found');
        }

        return sendSuccess(res, 200, result);
    } catch (err) {
        // Malformed :id (not a valid ObjectId) — same not-found collapse
        // as every other resource route in this codebase.
        if (err.name === 'CastError') {
            return sendError(res, 404, 'Error group not found');
        }
        const statusCode = err.statusCode || 500;
        return sendError(res, statusCode, err.message || 'Internal Server Error');
    }
}

module.exports = { updateStatus, getGroupDetail };