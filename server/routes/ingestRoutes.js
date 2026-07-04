const express = require('express');
const apiKeyMiddleware = require('../middleware/apiKeyMiddleware');
const ingestController = require('../controllers/ingestController');
const { ingestLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// API-key auth, not JWT — this is the one route client programs hit
// directly, no human dashboard session involved. See
// See DECISIONS.md's "API key hashing" entry for the separate-
// middleware rationale.
router.use(apiKeyMiddleware);
router.use(ingestLimiter);

router.post('/', ingestController.ingestEvent);

module.exports = router;