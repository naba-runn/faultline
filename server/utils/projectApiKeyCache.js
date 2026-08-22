// server/utils/projectApiKeyCache.js
//
// Task 38 perf follow-up: short-TTL in-memory cache for the
// apiKeyHash -> Project lookup that apiKeyMiddleware.js runs on every
// single ingestion request. Under k6 load-testing this was one of
// three unavoidable-looking sequential DB round trips per request —
// except this one, unlike the ErrorGroup upsert and ErrorEvent write,
// doesn't need to be fresh on every call: the same key is looked up
// repeatedly by the same caller, and the app has no key-rotation/
// revocation endpoint (see DECISIONS.md's "apiKeyMiddleware:
// short-TTL project cache" entry for the full reasoning and the
// tradeoff this accepts) — the only way a key stops being valid is
// its whole Project getting deleted, which projectService.deleteProject
// actively evicts here rather than waiting out the TTL.
//
// A standalone module (not folded into apiKeyMiddleware.js itself) so
// projectService.deleteProject can evict from it without a service
// reaching into middleware/ — same layering PROJECT_RULES.md §5
// enforces elsewhere (controllers never touch Mongoose directly,
// services never touch req/res); this is the equivalent for
// "services never reach into middleware."
//
// Deliberately process-local (a plain Map, not Redis) — this cache
// only needs to survive within one API process's lifetime, and adding
// a shared/distributed cache for a lookup this cheap to just
// recompute on a cache miss would be real infrastructure for no real
// benefit (see PROJECT_RULES.md's restraint-over-premature-
// infrastructure philosophy). Unbounded by count, not just TTL — for
// this app's actual scale (single-digit-to-low-hundreds of projects
// in realistic use) that's a non-issue; a production system with many
// thousands of distinct active keys would want an LRU cap too, not
// built here since it isn't this app's actual shape.

const TTL_MS = 30 * 1000;
const cache = new Map();

function get(apiKeyHash) {
  const entry = cache.get(apiKeyHash);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(apiKeyHash);
    return undefined;
  }
  return entry.project;
}

function set(apiKeyHash, project) {
  cache.set(apiKeyHash, { project, expiresAt: Date.now() + TTL_MS });
}

/**
 * Evicts a cached Project immediately by its apiKeyHash — called from
 * projectService.deleteProject so a deleted project's key stops being
 * accepted right away instead of waiting out TTL_MS. The cache key IS
 * the Project's own apiKeyHash field (not a recomputed value), so no
 * extra lookup is needed to evict it.
 */
function evict(apiKeyHash) {
  if (apiKeyHash) cache.delete(apiKeyHash);
}

module.exports = { get, set, evict, TTL_MS };
