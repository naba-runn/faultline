const express = require('express');
const docsController = require('../controllers/docsController');

const router = express.Router();

// GET /api/docs — public route, no auth required
router.get('/', docsController.getApiDocs);

module.exports = router;
