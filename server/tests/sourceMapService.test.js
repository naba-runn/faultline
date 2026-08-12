// server/tests/sourceMapService.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const SourceMap = require('../models/SourceMap');
const {
  validateSourceMap,
  uploadSourceMap,
  listSourceMaps,
  deleteSourceMap,
  resolveStack,
} = require('../services/sourceMapService');

const sampleSourceMap = {
  version: 3,
  sources: ['src/utils/calculator.js'],
  names: ['addNumbers'],
  mappings: 'yBAaQA',
  file: 'app.min.js',
};

test('validateSourceMap: accepts valid Source Map v3 object and JSON string', () => {
  const objResult = validateSourceMap(sampleSourceMap);
  assert.equal(objResult.version, 3);
  assert.deepEqual(objResult.sources, ['src/utils/calculator.js']);

  const strResult = validateSourceMap(JSON.stringify(sampleSourceMap));
  assert.equal(strResult.version, 3);
});

test('validateSourceMap: throws AppError for invalid source maps', () => {
  assert.throws(() => validateSourceMap('invalid json{'), {
    name: 'AppError',
    message: 'Invalid source map JSON content',
  });

  assert.throws(() => validateSourceMap({ version: 2, sources: [] }), {
    name: 'AppError',
    message: 'Source map must be a valid Source Map v3 (requires version: 3, sources: [], mappings: "")',
  });
});

test('uploadSourceMap: requires filename and valid map, upserts document', async () => {
  const originalFindOneAndUpdate = SourceMap.findOneAndUpdate;
  let capturedArgs = null;

  SourceMap.findOneAndUpdate = async (filter, update, opts) => {
    capturedArgs = { filter, update, opts };
    return {
      _id: 'map-id-123',
      filename: filter.filename,
      release: filter.release,
      uploadedAt: new Date(),
    };
  };

  try {
    const result = await uploadSourceMap({
      projectId: 'proj-1',
      filename: 'app.min.js',
      release: 'v1.0.0',
      map: sampleSourceMap,
    });

    assert.equal(result.id, 'map-id-123');
    assert.equal(result.filename, 'app.min.js');
    assert.equal(result.release, 'v1.0.0');
    assert.equal(capturedArgs.filter.projectId, 'proj-1');
    assert.equal(capturedArgs.filter.filename, 'app.min.js');
    assert.equal(capturedArgs.filter.release, 'v1.0.0');
  } finally {
    SourceMap.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test('resolveStack: returns unresolved frames when no source maps exist', async () => {
  const originalFind = SourceMap.find;
  SourceMap.find = async () => [];

  try {
    const stack = 'at a (app.min.js:1:25)';
    const resolved = await resolveStack({ projectId: 'proj-1', stack });

    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].file, 'app.min.js');
    assert.equal(resolved[0].resolved, false);
    assert.equal(resolved[0].originalFile, null);
  } finally {
    SourceMap.find = originalFind;
  }
});

test('resolveStack: resolves minified frames to original source positions when map exists', async () => {
  const originalFind = SourceMap.find;
  SourceMap.find = async (filter) => [
    {
      _id: 'doc-1',
      projectId: filter.projectId,
      filename: 'app.min.js',
      release: 'v1.4.2',
      map: sampleSourceMap,
    },
  ];

  try {
    const stack = 'at a (app.min.js:1:25)';
    const resolved = await resolveStack({
      projectId: 'proj-1',
      stack,
      release: 'v1.4.2',
    });

    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].resolved, true);
    assert.equal(resolved[0].originalFile, 'src/utils/calculator.js');
    assert.equal(resolved[0].originalLine, 14);
    assert.equal(resolved[0].originalColumn, 8);
    assert.equal(resolved[0].originalFunctionName, 'addNumbers');
  } finally {
    SourceMap.find = originalFind;
  }
});
