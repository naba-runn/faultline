const errorGroupService = require('../services/errorGroupService');
const sseHub = require('../services/sseHub');
const { sendSuccess, sendError } = require('../utils/httpResponse');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// Same three values as the ErrorGroup schema's `status` enum
// (server/models/ErrorGroup.js) — kept in sync manually since there's
// no shared constants module yet (premature abstraction for one enum
// used in exactly two places; see PROJECT_RULES.md §11).
const VALID_STATUSES = ['open', 'resolved', 'ignored'];

// catchAsync forwards any rejection to the central error middleware —
// see middleware/errorMiddleware.js. A malformed :id surfaces as a
// Mongoose CastError; that's caught locally (not centrally) so the
// resource-specific "Error group not found" message is preserved —
// only the controller layer knows which resource name to use, so this
// one piece of translation stays here rather than moving to the
// generic central handler (which would otherwise fall back to a
// generic "Resource not found").

const updateStatus = catchAsync(async (req, res) => {
    const { status } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
        return sendError(res, 400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    let group;
    try {
        group = await errorGroupService.updateGroupStatus({
            ownerId: req.user._id,
            groupId: req.params.id,
            status,
        });
    } catch (err) {
        if (err.name === 'CastError') {
            throw new AppError('Error group not found', 404);
        }
        throw err;
    }

    if (!group) {
        return sendError(res, 404, 'Error group not found');
    }

    // Task 26: dashboard live-update signal — fire-and-forget, same
    // reasoning as ingestController's publish call (a Redis hiccup
    // here shouldn't turn a successful status update into a failed
    // request; live viewers just miss the push and see it on next
    // manual refresh instead).
    sseHub.publish(group.projectId, 'status_changed', { errorGroupId: group.id, status: group.status }).catch((err) => {
        console.error(`[groupController] failed to publish SSE event for group ${group.id}:`, err.message);
    });

    return sendSuccess(res, 200, { group });
});

const getGroupDetail = catchAsync(async (req, res) => {
    let result;
    try {
        result = await errorGroupService.getGroupDetail({
            ownerId: req.user._id,
            groupId: req.params.id,
        });
    } catch (err) {
        if (err.name === 'CastError') {
            throw new AppError('Error group not found', 404);
        }
        throw err;
    }

    if (!result) {
        return sendError(res, 404, 'Error group not found');
    }

    return sendSuccess(res, 200, result);
});

module.exports = { updateStatus, getGroupDetail };