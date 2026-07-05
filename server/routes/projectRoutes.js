const express = require('express');
const projectController = require('../controllers/projectController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Every project route requires a logged-in dashboard user (JWT),
// not an API key — API-key auth is for the ingestion endpoint only
// (Task 6), a deliberately separate middleware. See DECISIONS.md.
router.use(authMiddleware);

router.post('/', projectController.createProject);
router.get('/', projectController.listProjects);
router.get('/:id', projectController.getProject);
router.get('/:id/groups', projectController.listProjectGroups);
// Task 23: dashboard-side synthetic error trigger. JWT-authed,
// ownership-scoped like every other project route -- see
// projectController.simulateError for why this reuses
// errorGroupService's real pipeline instead of duplicating logic.
router.post('/:id/simulate', projectController.simulateError);
router.patch('/:id', projectController.updateProject);
router.delete('/:id', projectController.deleteProject);

module.exports = router;