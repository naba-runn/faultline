const express = require('express');
const projectController = require('../controllers/projectController');
const sourceMapController = require('../controllers/sourceMapController');
const authMiddleware = require('../middleware/authMiddleware');
const apiKeyMiddleware = require('../middleware/apiKeyMiddleware');

const router = express.Router();

// Flexible auth for sourcemap upload: accepts API key (flt_...) or JWT token
async function sourcemapUploadAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (token && token.startsWith('flt_')) {
      return apiKeyMiddleware(req, res, next);
    }
  }
  return authMiddleware(req, res, next);
}

// Task 32: Source-map routes (placed before router.use(authMiddleware) for flexible auth)
router.post(
  '/:id/sourcemaps',
  express.json({ limit: '5mb' }),
  sourcemapUploadAuth,
  sourceMapController.uploadSourceMap
);
router.get('/:id/sourcemaps', authMiddleware, sourceMapController.listSourceMaps);
router.delete('/:id/sourcemaps/:mapId', authMiddleware, sourceMapController.deleteSourceMap);

// Every project route below requires a logged-in dashboard user (JWT),
// not an API key — API-key auth is for the ingestion endpoint only
// (Task 6), a deliberately separate middleware. See DECISIONS.md.
router.use(authMiddleware);

router.post('/', projectController.createProject);
router.get('/', projectController.listProjects);
// Task 36: must come before GET /:id — otherwise Express would match
// "/overview" as :id and hand a non-ObjectId string to
// projectService.getProject, which is a real path, just the wrong
// one for this route.
router.get('/overview', projectController.getDashboardOverview);
router.get('/:id', projectController.getProject);
router.get('/:id/groups', projectController.listProjectGroups);
// Task 23: dashboard-side synthetic error trigger. JWT-authed,
// ownership-scoped like every other project route -- see
// projectController.simulateError for why this reuses
// errorGroupService's real pipeline instead of duplicating logic.
router.post('/:id/simulate', projectController.simulateError);
// Task 26: mints a short-lived ticket for GET /api/sse/stream (a
// separate, unauthenticated-at-the-Express-level route -- see
// routes/sseRoutes.js and projectController.mintSseTicket for why).
router.post('/:id/sse-ticket', projectController.mintSseTicket);
// Task 28.1: separate from PATCH /:id (updateProject) -- alert config
// is a distinct concern (who gets notified, on what) from the
// project's own name/githubRepo fields, and Task 28.2/28.3 will add
// more behavior here without touching updateProject at all.
router.get('/:id/alerts', projectController.getAlertConfig);
router.patch('/:id/alerts', projectController.updateAlertConfig);
router.patch('/:id', projectController.updateProject);
router.delete('/:id', projectController.deleteProject);

module.exports = router;