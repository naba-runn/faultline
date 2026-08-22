# Faultline — API Reference

Updated as endpoints are implemented. Nothing here is aspirational —
if it's listed, it exists in code.

## Getting Started: Connecting Your Application

Faultline receives runtime errors from your external applications via an authenticated, language-agnostic HTTP ingestion endpoint.

```
External Application                 Faultline Ingestion Engine
[ Error Thrown / Caught ]
           │
           ▼ (POST /api/events with Bearer flt_...)
[ HTTP Ingestion ] ────────────► 1. API Key SHA-256 Auth
                                 2. Payload Validation & Sanitization
                                 3. Stack Trace Fingerprinting (Dedup)
                                 4. Atomic ErrorGroup Upsert + ErrorEvent Insert
                                 5. Live SSE Broadcast + Async AI Enrichment
```

### 1. Obtain an Ingestion API Key

1. Create a project via the Dashboard or `POST /api/projects`.
2. Save the returned `apiKey` (`flt_<64-hex-chars>`) immediately.
3. Store this key in your server environment (e.g. `FAULTLINE_API_KEY`).

> **Security Note:** Raw API keys are displayed exactly once at creation time. Faultline persists only SHA-256 hashes of API keys. Never commit API keys to source control or embed them in client-side / browser code.

### 2. GitHub Repository vs. Application Instrumentation

- **GitHub Repository (`owner/repo`):** Provides source-code context for Faultline's AI root cause analysis and source map resolution. Linking a repository does **not** instrument your application.
- **Application Instrumentation:** Your server application must explicitly report errors to Faultline's HTTP ingestion endpoint.

### 3. Ingestion Contract (`POST /api/events`)

- **URL:** `http://localhost:5050/api/events` (or your configured `FAULTLINE_API_URL`)
- **Headers:**
  - `Authorization: Bearer <YOUR_API_KEY>`
  - `Content-Type: application/json`
- **Request Body Fields:**
  - `message` *(string, required, max 1,000 chars)*: Error message.
  - `stack` *(string, required, max 10,000 chars)*: Full stack trace.
  - `env` *(string, optional)*: Deployment environment (e.g. `"production"`, `"staging"`).
  - `release` *(string, optional)*: Semantic version or git SHA (e.g. `"v1.4.2"`).
  - `metadata` *(object, optional)*: Arbitrary key-value context (e.g. `{ "userId": "123" }`).

### 4. Canonical Integration: Node.js & Express

```javascript
// Install: none (uses native fetch in Node 18+)
const FAULTLINE_API_URL = process.env.FAULTLINE_API_URL || 'http://localhost:5050/api/events';
const FAULTLINE_API_KEY = process.env.FAULTLINE_API_KEY || '<YOUR_API_KEY>';

async function reportErrorToFaultline(error, release = '1.0.0') {
  if (!FAULTLINE_API_KEY || FAULTLINE_API_KEY === '<YOUR_API_KEY>') return;
  try {
    await fetch(FAULTLINE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FAULTLINE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        env: process.env.NODE_ENV || 'production',
        release: release,
        metadata: { source: 'backend-api' },
      }),
    });
  } catch (err) {
    console.error('Failed to report error to Faultline:', err.message);
  }
}

// Express error-handling middleware (mount AFTER all routes)
app.use((err, req, res, next) => {
  reportErrorToFaultline(err);
  res.status(500).json({ error: 'Internal Server Error' });
});
```

---

## Health

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | – | Liveness check. Returns `{ success, status, env, timestamp }`. |

## Auth

### `POST /api/auth/register`

No auth required.

**Request body:**
```json
{ "name": "Nabarun Dey", "email": "nabarun@example.com", "password": "testpass123" }
```

**Success (201):**
```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "name": "...", "email": "...", "createdAt": "..." },
    "token": "<jwt>"
  }
}
```

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 400 | Missing `name`/`email`/`password` | `{ "success": false, "error": "name, email, and password are all required" }` |
| 400 | Mongoose validation fails (e.g. bad email format) | `{ "success": false, "error": "<validator message>" }` |
| 409 | Email already registered (DB-level unique constraint) | `{ "success": false, "error": "Email is already registered" }` |

### `POST /api/auth/login`

No auth required.

**Request body:**
```json
{ "email": "nabarun@example.com", "password": "testpass123" }
```

**Success (200):** same shape as register's `data`.

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 400 | Missing `email`/`password` | `{ "success": false, "error": "email and password are both required" }` |
| 401 | Wrong password OR email not found | `{ "success": false, "error": "Invalid email or password" }` (deliberately identical for both cases — see DECISIONS.md, prevents account enumeration) |

### `GET /api/auth/me`

Requires auth: `Authorization: Bearer <token>`.

**Success (200):**
```json
{ "success": true, "data": { "user": { "id": "...", "name": "...", "email": "...", "createdAt": "..." } } }
```

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 401 | No `Authorization` header, or not `Bearer` scheme | `{ "success": false, "error": "Not authorized, no token provided" }` |
| 401 | Malformed/invalid signature/expired token | `{ "success": false, "error": "Not authorized, invalid or expired token" }` |
| 401 | Token valid but the user it refers to no longer exists | `{ "success": false, "error": "Not authorized, user no longer exists" }` |

## Projects

### `POST /api/projects`

Requires auth: `Authorization: Bearer <token>` (JWT — dashboard user,
not API key).

**Request body:**
```json
{ "name": "My First Project", "githubRepo": "naba-runn/faultline" }
```
`githubRepo` is optional; if provided, must match `owner/repo` (e.g.
`^[\w.-]+\/[\w.-]+$`).

**Success (201):**
```json
{
  "success": true,
  "data": {
    "project": { "id": "...", "name": "...", "githubRepo": "...", "createdAt": "...", "updatedAt": "..." },
    "apiKey": "flt_<64 hex chars>"
  }
}
```
`apiKey` is the **raw key, returned exactly once** — it is not
recoverable afterward (only its SHA-256 hash is persisted). The
client is responsible for storing it.

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 400 | Missing `name` | `{ "success": false, "error": "name is required" }` |
| 400 | Malformed `githubRepo` | `{ "success": false, "error": "githubRepo must be in \"owner/repo\" form" }` |
| 401 | Missing/invalid/expired token | same shapes as `GET /api/auth/me` |

### `GET /api/projects`

Requires auth: `Authorization: Bearer <token>`.

Returns all projects owned by the authenticated user, most recent
first. `apiKeyHash` is never included.

**Success (200):**
```json
{ "success": true, "data": { "projects": [ { "id": "...", "name": "...", "githubRepo": "...", "createdAt": "...", "updatedAt": "..." } ] } }
```

### `GET /api/projects/overview` (Task 36)

Requires auth: `Authorization: Bearer <token>`.

Dashboard overview, aggregated across every project the authenticated
user owns — not scoped to a single project, so this must be (and is)
registered before `GET /api/projects/:id` in `routes/projectRoutes.js`
or Express would match `overview` as an `:id`. Three parts:

- `trend` — hourly ingested-error counts for the trailing 24h across
  all owned projects, as a 25-point series (24 full trailing hours
  plus the in-progress current hour), zero-filled for hours with no
  events. Bucketed with the same UTC-safe hour truncation Task 29's
  per-group spike detection uses (`trendService.startOfHour`).
- `alerts` — how many owned projects have at least one alert trigger
  enabled (Task 28's `newGroup`/`severityThreshold`, Task 30's
  `spikeDetection` — any one counts), plus the groups currently
  flagged `isSpiking` (Task 30's persisted state, read directly —
  this does **not** recompute a fresh trend for every group on every
  dashboard load).
- `releases` — the most recent error groups that carry a
  `firstSeenRelease` tag (Task 31), across all owned projects, newest
  first.

**Success (200):**
```json
{
  "success": true,
  "data": {
    "trend": {
      "windowHours": 24,
      "series": [ { "hour": "2026-08-12T11:00:00.000Z", "count": 3 }, "... 25 points total" ]
    },
    "alerts": {
      "totalProjects": 4,
      "projectsConfigured": 2,
      "spikingCount": 1,
      "spikingGroups": [
        { "groupId": "...", "projectId": "...", "projectName": "...", "message": "...", "lastSeen": "...", "count": 42 }
      ]
    },
    "releases": {
      "recent": [
        { "groupId": "...", "projectId": "...", "projectName": "...", "release": "v1.4.2", "message": "...", "firstSeen": "..." }
      ]
    }
  }
}
```

A user who owns zero projects gets the same shape back — a
zero-filled 25-point series and empty arrays, not a 404 or a 400.

### `GET /api/projects/:id`

Requires auth: `Authorization: Bearer <token>`.

**Success (200):** `{ "success": true, "data": { "project": {...} } }`
(same shape as the list endpoint's items).

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 404 | Project doesn't exist, belongs to another user, or `:id` isn't a valid ObjectId | `{ "success": false, "error": "Project not found" }` (all three cases deliberately identical — see DECISIONS.md) |

### `PATCH /api/projects/:id`

Requires auth: `Authorization: Bearer <token>`. Updates `name` and/or
`githubRepo` only — does not rotate the API key.

**Request body (either or both fields):**
```json
{ "name": "New Name", "githubRepo": "owner/repo" }
```

**Success (200):** same shape as `GET /api/projects/:id`, with
`updatedAt` reflecting the change.

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 400 | Malformed `githubRepo` | `{ "success": false, "error": "githubRepo must be in \"owner/repo\" form" }` |
| 404 | Same three cases as GET | `{ "success": false, "error": "Project not found" }` |

### `DELETE /api/projects/:id`

Requires auth: `Authorization: Bearer <token>`.

**Success:** `204 No Content`, empty body.

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 404 | Same three cases as GET | `{ "success": false, "error": "Project not found" }` |

### `POST /api/projects/:id/sourcemaps`

Task 32: Uploads or updates a source map for a project.
Requires auth: `Authorization: Bearer <token>` (JWT dashboard user) OR `Authorization: Bearer <apiKey>` (API key).

**Request body:**
```json
{
  "filename": "app.min.js",
  "release": "v1.4.2",
  "map": {
    "version": 3,
    "sources": ["src/utils/calculator.js"],
    "names": ["addNumbers"],
    "mappings": "yBAaQA",
    "file": "app.min.js"
  }
}
```
`filename` and `map` (valid Source Map v3 object or JSON string) are required. `release` is optional.

**Success (201):**
```json
{
  "success": true,
  "data": {
    "sourceMap": {
      "id": "...",
      "filename": "app.min.js",
      "release": "v1.4.2",
      "uploadedAt": "..."
    }
  }
}
```

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 403 | API-key auth, but `:id` in the URL doesn't match the key's own project | `{ "success": false, "error": "API key does not match the project in the URL" }` |

### `GET /api/projects/:id/sourcemaps`

Task 32: Lists metadata of all uploaded source maps for a project.
Requires auth: `Authorization: Bearer <token>` (JWT).

**Success (200):**
```json
{
  "success": true,
  "data": {
    "sourceMaps": [
      { "id": "...", "filename": "app.min.js", "release": "v1.4.2", "uploadedAt": "..." }
    ]
  }
}
```

### `DELETE /api/projects/:id/sourcemaps/:mapId`

Task 32: Deletes an uploaded source map by ID.
Requires auth: `Authorization: Bearer <token>` (JWT).

**Success (200):**
```json
{ "success": true, "data": { "deleted": true } }
```

### `GET /api/projects/:id/groups`

Requires auth: `Authorization: Bearer <token>`. Added in Task 17
(originally listed under Not Yet Implemented; built when Task 17's
client-side error group table turned out to need it).

Ownership checked the same way as `GET /api/projects/:id` — reuses
`projectService.getProject`, so the three not-found-or-not-yours cases
collapse into the same 404 as every other project route.

**Query Parameters (optional):**
- `limit` (number): max number of groups to return (default 20, max 100).
- `cursor` (string): pagination cursor.
- `status` (string): filter by status (`open`, `resolved`, `ignored`, or `all`).
- `search` or `query` (string): case-insensitive search matching error message.
- `severity` (string): filter by AI severity (`low`, `medium`, `high`, `critical`, or `all`).

**Success (200):**
```json
{
  "success": true,
  "data": {
    "groups": [
      {
        "id": "...",
        "message": "...",
        "status": "open",
        "count": 3,
        "firstSeen": "...",
        "lastSeen": "...",
        "firstSeenRelease": "v1.4.2",
        "aiSummary": { "severity": "high", "rootCause": "..." }
      }
    ]
  }
}
```
Sorted by `lastSeen` descending (most recently seen first). Each group
is deliberately shaped down for a list view: `stackSample` is omitted,
and `aiSummary` — when present — includes only `severity` and
`rootCause`, not `suggestedFix`/`confidence`/`affectedFile`/
`affectedFunction`. The full `ErrorGroup` document (via the still-not-
yet-built `GET /api/groups/:id`) is what Task 19's ErrorGroupDetail
page will fetch.

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 404 | Same three cases as `GET /api/projects/:id` | `{ "success": false, "error": "Project not found" }` |

### `POST /api/projects/:id/simulate`

Requires auth: `Authorization: Bearer <token>` (JWT — dashboard user,
same as every other project route; not the ingestion API key). Added
in Task 23, for the dashboard's "Simulate Error" button.

Exists because the ingestion endpoint (`POST /api/events`) is
API-key-authenticated, and a project's raw API key is shown exactly
once at creation and never stored in retrievable form (see
`POST /api/projects` above) — a logged-in dashboard user has no way to
call `/api/events` directly for their own project. This endpoint
closes that gap by reusing `errorGroupService.recordEvent` and (on a
new group) enqueuing an enrichment job via
`enrichmentQueue.enqueueEnrichment` — the same functions/queue the
real ingestion path uses (updated in Task 25; originally called
`enrichErrorGroup` directly) — behind ownership-scoped JWT auth
instead. No new dedup, fingerprinting, or AI logic; only a new auth
path into the existing pipeline. Ownership is checked the same way as
`GET /api/projects/:id/groups` (reuses `projectService.getProject`).

One of a small, fixed set of canned synthetic errors
(`projectController.js`'s `CANNED_ERRORS`) is chosen at random per
call — not user-supplied free text.

**Request body:** none.

**Success (202):**
```json
{
  "success": true,
  "data": {
    "received": true,
    "projectId": "...",
    "errorGroupId": "...",
    "isNewGroup": true
  }
}
```
Same 202 semantics as `POST /api/events` — accepted for processing.
When `isNewGroup` is `true`, an AI enrichment job is enqueued (not
called directly — see `enrichmentQueue.enqueueEnrichment`, Task 25)
after this response is sent; `aiSummary` will not be populated yet in
an immediate follow-up `GET`. Task 26 also publishes a `new_group` SSE
event on the project's live stream when this happens — see
`GET /api/sse/stream` below.

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 404 | Same three cases as `GET /api/projects/:id` | `{ "success": false, "error": "Project not found" }` |

### `POST /api/projects/:id/sse-ticket`

Requires auth: `Authorization: Bearer <token>` (JWT — dashboard user).
Added in Task 26, for the dashboard's live-update feature.

Mints a short-lived (30s), single-use ticket authorizing a subsequent
connection to `GET /api/sse/stream`. Exists because native
`EventSource` cannot send an `Authorization` header — there's no way
for the stream endpoint itself to check a JWT — so authorization
happens here instead, once, at mint time (ownership-checked the same
way as `POST /api/projects/:id/simulate`, reusing
`projectService.getProject`), and the resulting ticket is what proves
that check happened when the stream connection is opened moments
later. See `DECISIONS.md`'s "Task 26" entry for the full reasoning,
including why a JWT-in-query-string was rejected in favor of this.

**Request body:** none.

**Success (201):**
```json
{
  "success": true,
  "data": { "ticket": "a1b2c3...", "expiresInSeconds": 30 }
}
```

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 404 | Same three cases as `GET /api/projects/:id` | `{ "success": false, "error": "Project not found" }` |

### `GET /api/projects/:id/alerts`

Requires auth: `Authorization: Bearer <token>` (JWT — dashboard user).
Added in Task 28.1; **previously undocumented here** — like `GET
/api/groups/:id` before it (see that entry above), this route existed
in `routes/projectRoutes.js`/`controllers/projectController.js` with
no corresponding `API.md` entry at all, fixed now as part of Task 30
rather than left in place. Ownership-scoped the same way as every
other project route (`projectService.getAlertConfig`, a
`Project.findOne({ _id, ownerId })`).

**Success (200):**
```json
{
  "success": true,
  "data": {
    "alertConfig": {
      "email": null,
      "newGroup": false,
      "severityThreshold": { "enabled": false, "minSeverity": "high" },
      "spikeDetection": { "enabled": false }
    }
  }
}
```
Three independent triggers, matching three distinct firing points (see
`DECISIONS.md`'s "Task 28" and "Task 30" entries): `newGroup` fires
synchronously at ingestion; `severityThreshold` can only fire once the
async AI enrichment worker writes `aiSummary.severity`; `spikeDetection`
(Task 30) is re-evaluated on every ingested/simulated event for the
group, gated by an internal cooldown, and only actually alerts on the
transition into spiking, not on every event while a group stays above
threshold — see `services/errorGroupService.js`'s `maybeEvaluateSpike`
doc comment for the full mechanism. All three default to disabled;
`email` defaults to `null` (no recipient configured, nothing will ever
send regardless of the trigger booleans above).

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 404 | Same three cases as `GET /api/projects/:id` | `{ "success": false, "error": "Project not found" }` |

### `PATCH /api/projects/:id/alerts`

Requires auth: `Authorization: Bearer <token>` (JWT — dashboard user).
Same previously-undocumented status as the `GET` above, fixed
alongside it. Every field is independently optional — omitting a
field leaves it unchanged (same partial-update pattern as `PATCH
/api/projects/:id`'s `name`/`githubRepo`); this is enforced via
dotted-path `$set`s in `projectService.updateAlertConfig`, not a
whole-object replace, so e.g. `{ "spikeDetection": { "enabled": true } }`
alone cannot blow away an already-configured `email` or `newGroup`.

**Request body (all fields optional):**
```json
{
  "email": "me@example.com",
  "newGroup": true,
  "severityThreshold": { "enabled": true, "minSeverity": "critical" },
  "spikeDetection": { "enabled": true }
}
```
`spikeDetection` — added in Task 30, same enabled-only shape as
`newGroup` (not `severityThreshold`'s `enabled`+`minSeverity` pair —
there's no per-project multiplier/floor override; those stay
`trendService`'s fixed defaults, 3x/floor-5, per `TASKS.md`'s Task 29
spec). `email` accepts `null` to clear the configured recipient.

**Success (200):** same shape as the `GET` above, reflecting the
merged result.

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 400 | `email` present and not a string | `{ "success": false, "error": "email must be a string" }` |
| 400 | `newGroup` present and not a boolean | `{ "success": false, "error": "newGroup must be a boolean" }` |
| 400 | `severityThreshold` present and not an object | `{ "success": false, "error": "severityThreshold must be an object" }` |
| 400 | `severityThreshold.enabled` present and not a boolean | `{ "success": false, "error": "severityThreshold.enabled must be a boolean" }` |
| 400 | `severityThreshold.minSeverity` present and not one of the 4 valid levels | `{ "success": false, "error": "severityThreshold.minSeverity must be one of: low, medium, high, critical" }` |
| 400 | `spikeDetection` present and not an object | `{ "success": false, "error": "spikeDetection must be an object" }` |
| 400 | `spikeDetection.enabled` present and not a boolean | `{ "success": false, "error": "spikeDetection.enabled must be a boolean" }` |
| 404 | Same three cases as `GET /api/projects/:id` | `{ "success": false, "error": "Project not found" }` |

## Error Groups

### `GET /api/groups/:id`

Requires auth: `Authorization: Bearer <token>` (JWT — dashboard user).
Added in Task 19; **previously undocumented here** — this entry was
missing from `API.md` entirely despite the route/controller existing
since Task 19, a pre-existing docs-vs-code gap surfaced and fixed as
part of Task 29.2 rather than left in place. Powers the
ErrorGroupDetail page: one combined `{ group, events, trend }`
response, not split across separate endpoints — see `DECISIONS.md`,
"Task 19" for why. Ownership enforced the same way as the `PATCH`
below: group looked up by `:id` first, then its owning `Project`
checked via a scoped `Project.findOne({ _id, ownerId })`.

**Success (200):**
```json
{
  "success": true,
  "data": {
    "group": {
      "id": "...",
      "projectId": "...",
      "message": "TypeError: x is not a function",
      "stackSample": "...",
      "status": "open",
      "statusHistory": [ { "status": "open", "changedAt": "..." } ],
      "aiSummary": {
        "rootCause": "...",
        "severity": "high",
        "suggestedFix": ["...", "..."],
        "confidence": 0.8,
        "affectedFile": "...",
        "affectedFunction": "..."
      },
      "count": 12,
      "firstSeen": "...",
      "lastSeen": "...",
      "firstSeenRelease": "v1.4.2",
      "resolvedStack": [
        {
          "raw": "at a (app.min.js:1:25)",
          "file": "app.min.js",
          "line": 1,
          "column": 25,
          "functionName": "a",
          "resolved": true,
          "originalFile": "src/utils/calculator.js",
          "originalLine": 14,
          "originalColumn": 8,
          "originalFunctionName": "addNumbers"
        }
      ]
    },
    "events": [
      { "id": "...", "receivedAt": "...", "env": "production", "release": "v1.4.2" }
    ],
    "environments": ["production", "staging"],
    "trend": {
      "status": "ok",
      "isSpiking": false,
      "currentHourCount": 3,
      "baselineHourlyRate": 1.2
    }
  }
}
```
`events` is capped at the 50 most recent occurrences (`RECENT_EVENTS_LIMIT`
in `errorGroupService.js`), unrelated to Task 22's cursor pagination
(which covers the groups *list* only). `aiSummary` is `null` until
enrichment completes.

`trend` — added in Task 29.2, `services/trendService.js`'s
`computeTrend` output, restricted to the four fields the dashboard
actually needs (`multiplierObserved`/window-boundary fields stay
internal): `status` is `"ok"` or `"insufficient_history"` (the group is
younger than the 24h baseline window — every other field is then
meaningless and callers shouldn't display a rate); `isSpiking` is only
ever `true` when `status` is `"ok"`; `baselineHourlyRate` is the
trailing-24h average events/hour (can legitimately be `0`, distinct
from `insufficient_history`); `currentHourCount` is the current,
in-progress hour's raw count. Computed from a separate, time-bounded
`ErrorEvent` query (not the `events` list above, which has no time
bound and can be far narrower than 24h for a busy group) — see
`DECISIONS.md`'s "Task 29.2" entry.

`environments` — added in Task 31, a deduplicated, sorted array of
distinct `env` values across the fetched events (e.g.
`["production", "staging"]`). Surfaced at the group level so the
client can show which deployments this error has been seen in without
doing its own dedup. `null`/missing `env` values are filtered out.

`firstSeenRelease` — added in Task 31 on the group shape, the
`release` tag from the very first event that created this group
(e.g. `"v1.4.2"`). `null` if no release tag was provided at
creation time. Set once via `$setOnInsert`, never overwritten by
later duplicate events.

`resolvedStack` — added in Task 32 on the group shape, an array of
parsed stack frames resolved against uploaded source maps for this
project/release. For each frame, if a matching source map exists,
`resolved` is `true` and `originalFile`, `originalLine`,
`originalColumn`, `originalFunctionName` contain the original source
location; otherwise `resolved` is `false`. Display-only — does not alter
raw `stackSample` or error fingerprinting.

`release` — added in Task 31 on each event, the caller-supplied
build/version tag for that specific occurrence (e.g. `"v1.4.2"`).
`null` if the caller didn't provide one.

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 404 | Group doesn't exist, its project belongs to another user, or `:id` isn't a valid ObjectId | `{ "success": false, "error": "Error group not found" }` |

### `PATCH /api/groups/:id/status`

Requires auth: `Authorization: Bearer <token>` (JWT — dashboard user,
same as project routes; not the ingestion API key). Added in Task 18.

Ownership is enforced differently from the project routes above:
`ErrorGroup` doesn't carry `ownerId` directly, so the group is first
looked up by `:id`, then its owning `Project` is checked via a
`Project.findOne({ _id, ownerId })` scoped query — the actual
authorization decision is made by that scoped query, not by comparing
a fetched project's `ownerId` in application code. See `DECISIONS.md`,
"Task 18: ownership check for group status updates."

**Request body:**
```json
{ "status": "resolved" }
```
`status` must be one of `open` / `resolved` / `ignored` (same enum as
the `ErrorGroup` schema).

**Success (200):**
```json
{
  "success": true,
  "data": {
    "group": {
      "id": "...",
      "projectId": "...",
      "status": "resolved",
      "statusHistory": [
        { "status": "resolved", "changedAt": "..." }
      ]
    }
  }
}
```
`projectId` added in Task 26 (previously omitted — additive, not a
breaking change to this shape) so callers know which SSE channel a
resulting `status_changed` event belongs to; also published as a live
event on that project's stream, see `GET /api/sse/stream` below.
`statusHistory` is appended to, never overwritten — every PATCH adds
one entry, it never replaces prior ones (`DATABASE.md`'s locked
design). This PATCH deliberately never touches `lastSeen` — that
field's semantics are dedup-specific, unrelated to status edits (see
`DECISIONS.md`, "ErrorGroup uses firstSeen/lastSeen instead of
Mongoose timestamps").

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 400 | Missing/invalid `status` | `{ "success": false, "error": "status must be one of: open, resolved, ignored" }` |
| 404 | Group doesn't exist, its project belongs to another user, or `:id` isn't a valid ObjectId | `{ "success": false, "error": "Error group not found" }` (all three cases deliberately identical, same philosophy as the project 404s) |

## Ingestion

### `POST /api/events`

Requires auth: `Authorization: Bearer <apiKey>` (API key — client
program, not a dashboard user; see `apiKeyMiddleware`).

**Status: fully wired (Tasks 9.3, 13, 14; dispatch updated Task 25).**
Validates, fingerprints (`fingerprintService`), atomically upserts the
owning `ErrorGroup` (dedup), and persists the individual `ErrorEvent`.
On a **new** group only, an AI enrichment job is enqueued (BullMQ,
`enrichmentQueue.enqueueEnrichment`) after the response is sent (never
`await`-ed in this request cycle) — a separate `worker.js` process
consumes the queue, where `errorGroupService.enrichErrorGroup` fetches
a GitHub source snippet when the project has `githubRepo` configured,
calls Gemini, and saves `aiSummary: { rootCause, severity,
suggestedFix, confidence, affectedFile, affectedFunction }` on the
group a few seconds later — with up to 3 attempts and exponential
backoff on transient failures, since `worker.js` must be running for
this to happen at all (see `DECISIONS.md`'s "Task 25" entry). Duplicate
events never re-trigger enrichment. See `AI_CONTEXT.md` for the full
pipeline and `DECISIONS.md`'s Task 13/14/25 entries.

**Request body:**
```json
{
  "message": "TypeError: cannot read property x of undefined",
  "stack": "at foo (/app/index.js:10:5)",
  "env": "production",
  "release": "v1.4.2",
  "metadata": { "userId": "abc123" }
}
```
`message` and `stack` are required strings. `env`, `metadata`, and
`release` are optional. `env` is a free-form string label
(e.g. `"production"`, `"staging"`); `release` is a free-form
build/version tag (e.g. `"v1.4.2"`, `"abc123"`) — both stored as-is on
the created `ErrorEvent`, no shape enforced, per `DATABASE.md`'s locked
`ErrorEvent` design. `release` is additionally captured as
`ErrorGroup.firstSeenRelease` (insert-only, never overwritten) when the
event creates a brand-new group, powering the "introduced in vX.Y.Z"
label on the group detail page. `metadata` is a free-form object.


**Success (202):**
```json
{
  "success": true,
  "data": {    
    "received": true,
    "projectId": "...",
    "errorGroupId": "...",
    "isNewGroup": true
  }    
}
```
`202 Accepted`, not `201 Created` — deliberately: the contract has
always meant "accepted for processing." `isNewGroup` reflects whether
this event's fingerprint created a new `ErrorGroup` or matched an
existing one; on a new group, AI enrichment is dispatched right after
this response is sent (see the Status note above) — the `202` never
waits on it.

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 400 | Missing/non-string `message` | `{ "success": false, "error": "message is required and must be a string" }` |
| 400 | Missing/non-string `stack` | `{ "success": false, "error": "stack is required and must be a string" }` |
| 401 | Missing/malformed/wrong/revoked API key | `{ "success": false, "error": "Not authorized, no API key provided" }`
| 429 | Rate limit exceeded — 100 requests/minute, keyed per-project (Task 27; previously per-IP) | `{ "success": false, "error": "Too many requests, please slow down" }` |
| 500 | Unexpected persistence failure (DB unreachable, etc.) | `{ "success": false, "error": "Failed to process event" }` | or `"Not authorized, invalid API key"` — see `apiKeyMiddleware` in DECISIONS.md for why these aren't distinguished further |

## Real-Time Events (Task 26)

Server-Sent Events push live updates to the dashboard — new error
groups, status changes, and enrichment completions — without the
client needing to poll or manually refresh. See `DECISIONS.md`'s
"Task 26" entry for the full architecture and reasoning (Redis pub/sub
fan-out via `services/sseHub.js`, the ticket-based auth pattern, and
why a JWT directly in the stream URL was rejected).

### `POST /api/projects/:id/sse-ticket`

Documented above, under Projects — included here too since it's the
first half of this feature's request flow.

### `GET /api/sse/stream?ticket=<ticket>`

**No `Authorization` header — deliberately not behind the usual JWT
middleware.** Native `EventSource` cannot send custom headers, so this
route has nothing to check a header against; authorization already
happened at ticket-mint time (see
`POST /api/projects/:id/sse-ticket` above). The `ticket` query param
is validated via an atomic Redis `GETDEL` (read-and-delete in one
command) — valid exactly once, and only within ~30 seconds of being
minted.

**Success:** `200`, `Content-Type: text/event-stream`, connection held
open. Sends an initial `: connected` comment so the client's
`EventSource.onopen` fires promptly, then a `: heartbeat` comment every
20 seconds to keep the connection alive through idle-timeout proxies
(comments are invisible to `EventSource.onmessage` — only `data:` lines
fire it). Each live event is written as:
```
data: {"type":"new_group","payload":{"errorGroupId":"..."}}

```
`type` is one of `new_group` (from `POST /api/events` or
`POST /api/projects/:id/simulate`, a genuinely new `ErrorGroup`),
`duplicate_recorded` (from either of those same two endpoints, when the
event matched an *existing* group — payload includes the updated
`count`; added after initial Task 26 shipped, once manual testing
surfaced that a count-bump was otherwise invisible to live viewers),
`status_changed` (from `PATCH /api/groups/:id/status`), or
`enrichment_completed` (from `worker.js`, published only on a
successful enrichment — a failed job, even after all retries, has
nothing new to announce; `aiSummary` stays null exactly as before Task
25). The connection stays open until the client closes it or the
ticket's originating project stops being relevant to that page.

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 401 | Missing `ticket` query param | `{ "success": false, "error": "Missing ticket" }` |
| 401 | Ticket invalid, already used, or expired | `{ "success": false, "error": "Invalid or expired ticket" }` |
| 500 | Redis lookup failed | `{ "success": false, "error": "Failed to validate ticket" }` |

## Documentation (Task 35)

### `GET /api/docs`

Public endpoint — no auth required. Reads raw `docs/API.md` content directly from the filesystem to power the web application's live API reference page at `/docs`.

**Success (200):**
```json
{
  "success": true,
  "data": {
    "markdown": "# Faultline — API Reference\n...",
    "updatedAt": "2026-08-13T02:47:43.000Z"
  }
}
```