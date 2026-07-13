const express = require('express');
const sseController = require('../controllers/sseController');

const router = express.Router();

// Task 26: deliberately NOT router.use(authMiddleware) here, unlike
// every other route file in this app -- native EventSource can't send
// an Authorization header, so there's no JWT for a middleware to
// check. Security comes entirely from the ticket (see
// controllers/sseController.js and projectController.mintSseTicket).
router.get('/stream', sseController.streamEvents);

module.exports = router;