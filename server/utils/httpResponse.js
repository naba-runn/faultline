/**
 * Response-shaping helpers only. This is explicitly NOT the Task 20
 * AppError/catchAsync refactor — no custom Error subclasses, no
 * catchAsync higher-order function, no change to how errors are
 * thrown or caught. Only the final `res.status(...).json({...})`
 * step, previously duplicated across authController/projectController/
 * ingestController, is deduplicated here. See DECISIONS.md, "httpResponse
 * helper: response-shaping only, not Task 20".
 */

function sendSuccess(res, statusCode, data) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

function sendError(res, statusCode, message) {
  return res.status(statusCode).json({
    success: false,
    error: message,
  });
}

module.exports = { sendSuccess, sendError };
