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

## Not Yet Implemented

Planned per the blueprint (added to this table as each is built):

- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `DELETE /api/projects/:id`
- `POST /api/events`
- `GET /api/projects/:id/groups`
- `GET /api/groups/:id`
- `PATCH /api/groups/:id/status`