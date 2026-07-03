const express = require('express');
const projectController = require('../controllers/projectController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Every project route requires a logged-in dashboard user (JWT),
// not an API key — API-key auth is for the ingestion endpoint only
// (Task 6), a deliberately separate middleware. See PROJECT_CONTEXT.md.
router.use(authMiddleware);

router.post('/', projectController.createProject);
router.get('/', projectController.listProjects);

module.exports = router;