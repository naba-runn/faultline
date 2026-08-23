const express = require('express');
const incidentController = require('../controllers/incidentController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Same dashboard-user (JWT) auth as groupRoutes.js — incidents are
// viewed/managed from the dashboard, never touched by the ingestion
// API-key path.
router.use(authMiddleware);

router.get('/:id', incidentController.getIncidentDetail);
router.patch('/:id/status', incidentController.updateStatus);

module.exports = router;
