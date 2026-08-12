const sourceMapJs = require('source-map-js');
const SourceMap = require('../models/SourceMap');
const { parseStackFrames } = require('../utils/stackNormalizer');
const AppError = require('../utils/AppError');

/**
 * Validates whether a provided object or JSON string is a valid Source Map v3.
 *
 * @param {object|string} mapInput
 * @returns {object} Parsed source map object
 */
function validateSourceMap(mapInput) {
  let mapObj = mapInput;
  if (typeof mapInput === 'string') {
    try {
      mapObj = JSON.parse(mapInput);
    } catch (err) {
      throw new AppError('Invalid source map JSON content', 400);
    }
  }

  if (
    !mapObj ||
    typeof mapObj !== 'object' ||
    (mapObj.version !== 3 && mapObj.version !== '3') ||
    !Array.isArray(mapObj.sources) ||
    typeof mapObj.mappings !== 'string'
  ) {
    throw new AppError('Source map must be a valid Source Map v3 (requires version: 3, sources: [], mappings: "")', 400);
  }

  return mapObj;
}

/**
 * Uploads (or overwrites) a source map for a given project, filename, and optional release.
 */
async function uploadSourceMap({ projectId, filename, release = null, map }) {
  if (!filename || typeof filename !== 'string') {
    throw new AppError('filename is required and must be a string', 400);
  }

  const validMap = validateSourceMap(map);
  const cleanRelease = release ? String(release).trim() : null;
  const cleanFilename = String(filename).trim();

  const doc = await SourceMap.findOneAndUpdate(
    { projectId, release: cleanRelease, filename: cleanFilename },
    {
      $set: {
        map: validMap,
        uploadedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  return {
    id: doc._id,
    filename: doc.filename,
    release: doc.release,
    uploadedAt: doc.uploadedAt,
  };
}

/**
 * Lists metadata of all uploaded source maps for a project.
 */
async function listSourceMaps(projectId) {
  const maps = await SourceMap.find({ projectId }).sort({ uploadedAt: -1 });

  return maps.map((m) => ({
    id: m._id,
    filename: m.filename,
    release: m.release,
    uploadedAt: m.uploadedAt,
  }));
}

/**
 * Deletes an uploaded source map by ID for a specific project.
 */
async function deleteSourceMap({ projectId, mapId }) {
  const doc = await SourceMap.findOneAndDelete({ _id: mapId, projectId });
  if (!doc) {
    throw new AppError('Source map not found', 404);
  }
  return true;
}

/**
 * Normalizes a file URL or path for matching against source map filenames.
 * E.g., "http://localhost:5173/assets/bundle.min.js" -> "bundle.min.js"
 */
function extractFilename(filePath) {
  if (!filePath) return '';
  const cleanPath = filePath.split('?')[0].split('#')[0];
  const parts = cleanPath.split('/');
  return parts[parts.length - 1] || cleanPath;
}

/**
 * Resolves a raw stack trace using uploaded source maps for the given project.
 * Display-only — does not alter fingerprinting or database persistence.
 *
 * @param {object} params
 * @param {string} params.projectId
 * @param {string} params.stack
 * @param {string|null} params.release
 * @returns {Array<object>} Array of resolved frame objects
 */
async function resolveStack({ projectId, stack, release = null }) {
  const frames = parseStackFrames(stack);
  if (!frames || frames.length === 0) {
    return [];
  }

  // Fetch all source maps for this project
  const sourceMapDocs = await SourceMap.find({ projectId });
  if (!sourceMapDocs || sourceMapDocs.length === 0) {
    return frames.map((f) => ({
      ...f,
      resolved: false,
      originalFile: null,
      originalLine: null,
      originalColumn: null,
      originalFunctionName: null,
    }));
  }

  // Cache consumers for map docs to avoid re-instantiating multiple times per stack
  const consumerCache = new Map();
  function getConsumer(doc) {
    if (!consumerCache.has(doc._id.toString())) {
      consumerCache.set(doc._id.toString(), new sourceMapJs.SourceMapConsumer(doc.map));
    }
    return consumerCache.get(doc._id.toString());
  }

  return frames.map((frame) => {
    const frameFile = extractFilename(frame.file);

    // Look for matching source map doc:
    // 1. Match both release and filename
    // 2. Fall back to matching filename only
    let matchedDoc = sourceMapDocs.find(
      (d) => d.filename === frameFile && d.release === release
    );
    if (!matchedDoc) {
      matchedDoc = sourceMapDocs.find((d) => d.filename === frameFile);
    }

    if (!matchedDoc) {
      return {
        ...frame,
        resolved: false,
        originalFile: null,
        originalLine: null,
        originalColumn: null,
        originalFunctionName: null,
      };
    }

    try {
      const consumer = getConsumer(matchedDoc);
      const pos = consumer.originalPositionFor({
        line: frame.line,
        column: frame.column,
      });

      if (pos && pos.source) {
        return {
          ...frame,
          resolved: true,
          originalFile: pos.source,
          originalLine: pos.line,
          originalColumn: pos.column,
          originalFunctionName: pos.name || frame.functionName,
        };
      }
    } catch (err) {
      // Source map lookup error for this frame — return fallback
    }

    return {
      ...frame,
      resolved: false,
      originalFile: null,
      originalLine: null,
      originalColumn: null,
      originalFunctionName: null,
    };
  });
}

module.exports = {
  validateSourceMap,
  uploadSourceMap,
  listSourceMaps,
  deleteSourceMap,
  resolveStack,
};
