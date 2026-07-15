# Faultline — API Reference

Updated as endpoints are implemented. Nothing here is aspirational —
if it's listed, it exists in code.

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

### `GET /api/projects/:id/groups`

Requires auth: `Authorization: Bearer <token>`. Added in Task 17
(originally listed under Not Yet Implemented; built when Task 17's
client-side error group table turned out to need it).

Ownership checked the same way as `GET /api/projects/:id` — reuses
`projectService.getProject`, so the three not-found-or-not-yours cases
collapse into the same 404 as every other project route.

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

## Error Groups

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
  "metadata": { "userId": "abc123" }
}
```
`message` and `stack` are required strings. `env` and `metadata` are
optional, unvalidated, and stored as-is on the created `ErrorEvent`
(`env` as a free-form string, `metadata` as a free-form object) — no
shape is enforced, per `DATABASE.md`'s locked `ErrorEvent` design.


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