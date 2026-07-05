const express = require('express');
const groupController = require('../controllers/groupController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Same dashboard-user (JWT) auth as project routes — status changes
// come from the dashboard UI, not the ingestion client. API-key auth
// stays scoped to /api/events only. See DECISIONS.md's "API key
// hashing" entry for the deliberate API-key-vs-JWT split.
router.use(authMiddleware);

router.patch('/:id/status', groupController.updateStatus);

module.exports = router;