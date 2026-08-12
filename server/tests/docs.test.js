// server/tests/docs.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs').promises;
const path = require('path');
const { getApiDocs } = require('../controllers/docsController');

test('GET /api/docs controller: reads API.md and returns markdown content', async () => {
  let responseData = null;
  let responseStatus = null;

  const req = {};
  const res = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };

  await getApiDocs(req, res);

  assert.equal(responseStatus, 200);
  assert.equal(responseData.success, true);
  assert.ok(typeof responseData.data.markdown === 'string');
  assert.ok(responseData.data.markdown.includes('Faultline — API Reference'));
  assert.ok(typeof responseData.data.updatedAt === 'string');
});
