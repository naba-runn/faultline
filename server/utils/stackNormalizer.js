/**
 * Pure stack-trace parsing/normalization helpers. No DB, no req/res —
 * used by fingerprintService (Task 8.2) to build a stable dedup key,
 * and later by Task 14 to derive affectedFile/affectedFunction from
 * the same parsed frames (not asked of the LLM — see AI_CONTEXT.md).
 */

// Matches a named V8/Node frame: "at functionName (file:line:col)"
// Covers "at foo (...)", "at Object.<anonymous> (...)", "at new Foo (...)".
// A leading "async " is consumed but not captured, so it doesn't leak
// into functionName.
const NAMED_FRAME = /^\s*at\s+(?:async\s+)?(.+?)\s+\((.+):(\d+):(\d+)\)\s*$/;

// Matches an anonymous frame: "at file:line:col" (no function name).
// Same "async " handling as above — otherwise "at async /path/file.js:1:1"
// would have "async " swallowed into the captured file path instead of
// being recognized as an anonymous frame.
const ANON_FRAME = /^\s*at\s+(?:async\s+)?(.+):(\d+):(\d+)\s*$/;

/**
 * Parses a raw stack-trace string (frame lines only — no leading
 * "TypeError: ..." message line is expected) into structured frames.
 * Lines that don't match a recognizable frame shape are skipped
 * rather than throwing, since stack formats vary slightly across
 * runtimes/browsers and a partially-parseable stack is still useful.
 *
 * @param {string} stack
 * @returns {Array<{ raw: string, functionName: string|null, file: string, line: number, column: number }>}
 */
function parseStackFrames(stack) {
  if (!stack || typeof stack !== 'string') return [];

  return stack
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const named = line.match(NAMED_FRAME);
      if (named) {
        return {
          raw: line,
          functionName: named[1],
          file: named[2],
          line: Number(named[3]),
          column: Number(named[4]),
        };
      }

      const anon = line.match(ANON_FRAME);
      if (anon) {
        return {
          raw: line,
          functionName: null,
          file: anon[1],
          line: Number(anon[2]),
          column: Number(anon[3]),
        };
      }

      return null;
    })
    .filter(Boolean);
}

// Frames whose file path contains this are dependency/runtime internals,
// not application code — excluded from fingerprinting so that the same
// app-level bug still groups together across different dependency
// versions or Node-internal call paths.
const NON_APP_PATH = /node_modules|^node:|^internal\//i;

/**
 * Reduces an absolute, machine-specific file path to a stable relative
 * anchor. Different environments (local machine, Docker, CI) put the
 * same source file at different absolute prefixes
 * (/Users/x/faultline/server/routes/foo.js vs /app/server/routes/foo.js),
 * so fingerprinting on the raw absolute path would treat the same bug
 * as new on every environment. Anchoring on a conventional root
 * directory name keeps the meaningful part of the path stable across
 * environments without needing the caller to tell us their project root.
 *
 * Falls back to just the file's basename if no conventional root
 * segment is found, which is still stable — just less specific.
 */
function normalizeFilePath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const segments = normalized.split('/');
  const rootMarkers = ['src', 'server', 'client', 'app', 'lib'];

  // Last match, not first: a path like "/app/server/services/foo.js"
  // (Docker deploy root "app" wrapping the real "server" source root)
  // would anchor on the wrong, less-specific "app" if we took the first
  // hit. Taking the last marker favors the innermost/most specific root,
  // which is what actually varies least across environments.
  let rootIndex = -1;
  for (let i = 0; i < segments.length; i++) {
    if (rootMarkers.includes(segments[i].toLowerCase())) {
      rootIndex = i;
    }
  }

  if (rootIndex !== -1) {
    return segments.slice(rootIndex).join('/');
  }

  return segments[segments.length - 1] || normalized;
}

const MAX_FINGERPRINT_FRAMES = 5;

/**
 * Produces a normalized, order-preserving signature for a stack trace:
 * app-code frames only (falls back to all frames if every frame looks
 * like dependency/runtime code — an error can legitimately originate
 * entirely inside a library), capped to the top N frames closest to
 * where the error was thrown, with paths reduced to a stable relative
 * form. This signature (not the raw stack) is what fingerprintService
 * hashes.
 *
 * @param {string} stack
 * @returns {{ frames: Array, signature: string }}
 */
function normalizeStack(stack) {
  const allFrames = parseStackFrames(stack);
  const appFrames = allFrames.filter((f) => !NON_APP_PATH.test(f.file));
  const relevantFrames = (appFrames.length > 0 ? appFrames : allFrames).slice(
    0,
    MAX_FINGERPRINT_FRAMES
  );

  const signature = relevantFrames
    .map(
      (f) =>
        `${f.functionName || 'anonymous'}@${normalizeFilePath(f.file)}:${f.line}`
    )
    .join(' > ');

  return { frames: relevantFrames, signature };
}

module.exports = { parseStackFrames, normalizeStack, normalizeFilePath };