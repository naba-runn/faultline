const express = require('express');
const webhookController = require('../controllers/webhookController');

const router = express.Router();

// Task 40.2: deliberately NOT authMiddleware/apiKeyMiddleware — a
// webhook has no JWT and no API key, only GitHub's own HMAC signature
// (verified inside the controller against the raw request body). See
// app.js for the dedicated json({ verify }) mount this route needs to
// capture that raw body before it's parsed away.
router.post('/github/:projectId', webhookController.receiveGithubDeployment);

module.exports = router;
