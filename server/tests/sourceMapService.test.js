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

// resolveStack now calls SourceMap.find(...).lean() (bounded to the
// stack's own filenames, not every map in the project — see
// sourceMapService.js's comment on why) — this fake mimics the real
// Mongoose query's .lean() chain terminator so the service code under
// test can run unmodified.
function findReturning(docs) {
  return (filter) => ({
    lean: () => Promise.resolve(typeof docs === 'function' ? docs(filter) : docs),
  });
}

test('uploadSourceMap: whitespace-only release collapses to null, same as an omitted release', async () => {
  const originalFindOneAndUpdate = SourceMap.findOneAndUpdate;
  let capturedFilter = null;

  SourceMap.findOneAndUpdate = async (filter) => {
    capturedFilter = filter;
    return { _id: 'map-id-456', filename: filter.filename, release: filter.release, uploadedAt: new Date() };
  };

  try {
    await uploadSourceMap({
      projectId: 'proj-1',
      filename: 'app.min.js',
      release: '   ',
      map: sampleSourceMap,
    });

    // Not "" — an empty-string release would never match resolveStack's
    // release-aware lookup (which compares against `null` for "no
    // release"), silently orphaning the upload. See sourceMapService.js's
    // comment on this fix.
    assert.equal(capturedFilter.release, null);
  } finally {
    SourceMap.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test('resolveStack: returns unresolved frames when no source maps exist', async () => {
  const originalFind = SourceMap.find;
  SourceMap.find = findReturning([]);

  try {
    const stack = 'at a (app.min.js:1:25)';
    const resolved = await resolveStack({ projectId: 'proj-1', stack });

    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].file, 'app.min.js');
    assert.equal(resolved[0].resolved, false);
    assert.equal(resolved[0].releaseMismatch, false);
    assert.equal(resolved[0].originalFile, null);
  } finally {
    SourceMap.find = originalFind;
  }
});

test('resolveStack: queries only the filenames referenced by the stack, not every map in the project', async () => {
  const originalFind = SourceMap.find;
  let capturedFilter = null;
  SourceMap.find = (filter) => {
    capturedFilter = filter;
    return { lean: () => Promise.resolve([]) };
  };

  try {
    const stack = 'at a (app.min.js:1:25)\n    at b (vendor.min.js:2:10)';
    await resolveStack({ projectId: 'proj-1', stack });

    assert.equal(capturedFilter.projectId, 'proj-1');
    assert.deepEqual([...capturedFilter.filename.$in].sort(), ['app.min.js', 'vendor.min.js']);
  } finally {
    SourceMap.find = originalFind;
  }
});

test('resolveStack: resolves minified frames to original source positions when map exists', async () => {
  const originalFind = SourceMap.find;
  SourceMap.find = findReturning((filter) => [
    {
      _id: 'doc-1',
      projectId: filter.projectId,
      filename: 'app.min.js',
      release: 'v1.4.2',
      map: sampleSourceMap,
    },
  ]);

  try {
    const stack = 'at a (app.min.js:1:25)';
    const resolved = await resolveStack({
      projectId: 'proj-1',
      stack,
      release: 'v1.4.2',
    });

    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].resolved, true);
    assert.equal(resolved[0].releaseMismatch, false);
    assert.equal(resolved[0].originalFile, 'src/utils/calculator.js');
    assert.equal(resolved[0].originalLine, 14);
    assert.equal(resolved[0].originalColumn, 8);
    assert.equal(resolved[0].originalFunctionName, 'addNumbers');
  } finally {
    SourceMap.find = originalFind;
  }
});

test('resolveStack: falls back to a different release\'s map but flags releaseMismatch:true', async () => {
  const originalFind = SourceMap.find;
  SourceMap.find = findReturning([
    {
      _id: 'doc-1',
      filename: 'app.min.js',
      release: 'v1.0.0', // requested release below is v2.0.0 — no exact match
      map: sampleSourceMap,
    },
  ]);

  try {
    const stack = 'at a (app.min.js:1:25)';
    const resolved = await resolveStack({
      projectId: 'proj-1',
      stack,
      release: 'v2.0.0',
    });

    assert.equal(resolved.length, 1);
    // Still resolved (a mapping was found and used) but explicitly
    // flagged as a cross-release fallback, not silently indistinguishable
    // from an exact-release match — see sourceMapService.js's comment.
    assert.equal(resolved[0].resolved, true);
    assert.equal(resolved[0].releaseMismatch, true);
    assert.equal(resolved[0].originalFile, 'src/utils/calculator.js');
  } finally {
    SourceMap.find = originalFind;
  }
});
