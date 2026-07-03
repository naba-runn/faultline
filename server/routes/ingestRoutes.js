const express = require('express');
const apiKeyMiddleware = require('../middleware/apiKeyMiddleware');
const ingestController = require('../controllers/ingestController');

const router = express.Router();

// API-key auth, not JWT — this is the one route client programs hit
// directly, no human dashboard session involved. See
// PROJECT_CONTEXT.md's "Key Architectural Decisions" #5.
router.use(apiKeyMiddleware);

router.post('/', ingestController.ingestEvent);

module.exports = router;