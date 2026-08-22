const mongoose = require('mongoose');
const sourceMapJs = require('source-map-js');
const SourceMap = require('../models/SourceMap');
const { parseStackFrames } = require('../utils/stackNormalizer');
const AppError = require('../utils/AppError');

function normalizeProjectId(projectId) {
  if (!projectId) return projectId;
  if (projectId instanceof mongoose.Types.ObjectId) return projectId;
  if (mongoose.Types.ObjectId.isValid(projectId)) {
    return new mongoose.Types.ObjectId(projectId);
  }
  return projectId;
}

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
  // Trim first, then check for emptiness — `release` is truthy for any
  // non-empty string including "   ", so checking truthiness before
  // trimming let a whitespace-only release survive as "" instead of
  // collapsing to null like an actually-omitted release does. "" and
  // null would then be two different, silently-diverging "no release"
  // values in the same unique index ({ projectId, release, filename }),
  // which resolveStack's release-aware lookup (release === null) would
  // never match against.
  const trimmedRelease = release != null ? String(release).trim() : '';
  const cleanRelease = trimmedRelease || null;
  const cleanFilename = String(filename).trim();
  const normalizedProjectId = normalizeProjectId(projectId);

  const doc = await SourceMap.findOneAndUpdate(
    { projectId: normalizedProjectId, release: cleanRelease, filename: cleanFilename },
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
  const normalizedProjectId = normalizeProjectId(projectId);
  // Projected to metadata only + .lean() — this is a metadata listing
  // (id/filename/release/uploadedAt), it never needs the `map` field
  // itself, which can be up to the 5mb upload cap per doc. Pulling
  // every full map blob into Mongoose documents just to read four
  // small fields off each was needless — a project with a healthy
  // number of uploaded maps could mean tens of MB deserialized for a
  // response that's a few hundred bytes.
  const maps = await SourceMap.find({ projectId: normalizedProjectId })
    .select('filename release uploadedAt')
    .sort({ uploadedAt: -1 })
    .lean();

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
  const normalizedProjectId = normalizeProjectId(projectId);
  const doc = await SourceMap.findOneAndDelete({ _id: mapId, projectId: normalizedProjectId });
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

  // Fetch only the source maps whose filename could actually match a
  // frame in this stack, not every map ever uploaded for the project.
  // A stack trace typically references a small, fixed set of bundle
  // filenames (often just one), so this bounds the query by stack
  // size rather than by how many maps/releases a project has
  // accumulated over time — the old unfiltered SourceMap.find(...)
  // pulled every doc's full `map` blob (up to 5mb each) into memory
  // on every group-detail view and every enrichment job, regardless
  // of whether that map was even relevant to this stack.
  const normalizedProjectId = normalizeProjectId(projectId);
  const candidateFilenames = [...new Set(frames.map((f) => extractFilename(f.file)).filter(Boolean))];
  const sourceMapDocs = candidateFilenames.length > 0
    ? await SourceMap.find({ projectId: normalizedProjectId, filename: { $in: candidateFilenames } }).lean()
    : [];
  if (!sourceMapDocs || sourceMapDocs.length === 0) {
    return frames.map((f) => ({
      ...f,
      resolved: false,
      releaseMismatch: false,
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
    // 2. Fall back to matching filename only, across ANY release —
    //    useful when a project uploads one map with no release tag,
    //    or the requested release has no map of its own yet. Flagged
    //    via `releaseMismatch` below rather than silently treated the
    //    same as an exact match: two different releases of the same
    //    filename can have completely different mappings (a rebuild
    //    changes line/column offsets even for unrelated code), so a
    //    fallback match can resolve to a plausible-looking but wrong
    //    original file/line. Callers/UI can choose to hide, gray out,
    //    or caveat a releaseMismatch:true result instead of presenting
    //    it with the same confidence as an exact-release match.
    let matchedDoc = sourceMapDocs.find(
      (d) => d.filename === frameFile && d.release === release
    );
    if (!matchedDoc) {
      matchedDoc = sourceMapDocs.find((d) => d.filename === frameFile);
    }
    const releaseMismatch = Boolean(matchedDoc && matchedDoc.release !== release);

    if (!matchedDoc) {
      return {
        ...frame,
        resolved: false,
        releaseMismatch: false,
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
          releaseMismatch,
          originalFile: pos.source,
          originalLine: pos.line,
          originalColumn: pos.column,
          originalFunctionName: pos.name || frame.functionName,
        };
      }
    } catch (err) {
      // Source map lookup error for this frame — this is display-only
      // enrichment, so a single bad/corrupt map must not fail the whole
      // stack resolution; fall back to the unresolved frame below. Still
      // logged (with the doc it came from) so a bad upload is visible
      // instead of silently degrading every stack view for that release.
      console.error(
        `[sourceMapService] Failed to resolve frame against source map ${matchedDoc._id}: ${err.message}`
      );
    }

    return {
      ...frame,
      resolved: false,
      releaseMismatch: false,
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