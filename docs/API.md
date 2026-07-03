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

## Ingestion

### `POST /api/events`

Requires auth: `Authorization: Bearer <apiKey>` (API key — client
program, not a dashboard user; see `apiKeyMiddleware`).

**Status: fully wired (Task 9.3).** Validates, fingerprints
(`fingerprintService`), atomically upserts the owning `ErrorGroup`
(dedup), and persists the individual `ErrorEvent`. AI enrichment is
*not* triggered here — that's Task 13's fire-and-forget dispatch,
not yet built.

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
202 Accepted`, not `201 Created` — deliberately: the contract has
always meant "accepted for processing," and processing now includes
persistence but still excludes AI enrichment (Task 13), so `202`
remains the honest status. `isNewGroup` reflects whether this event's
fingerprint created a new `ErrorGroup` or matched an existing one.

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 400 | Missing/non-string `message` | `{ "success": false, "error": "message is required and must be a string" }` |
| 400 | Missing/non-string `stack` | `{ "success": false, "error": "stack is required and must be a string" }` |
| 401 | Missing/malformed/wrong/revoked API key | `{ "success": false, "error": "Not authorized, no API key provided" }`
| 500 | Unexpected persistence failure (DB unreachable, etc.) | `{ "success": false, "error": "Failed to process event" }` | or `"Not authorized, invalid API key"` — see `apiKeyMiddleware` in DECISIONS.md for why these aren't distinguished further |

## Not Yet Implemented

Planned per the blueprint (added to this table as each is built):

- `GET /api/projects/:id/groups`
- `GET /api/groups/:id`
- `PATCH /api/groups/:id/status`