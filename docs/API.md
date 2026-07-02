# Faultline — API Reference

Updated as endpoints are implemented. Nothing here is aspirational —
if it's listed, it exists in code.

## Health

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | – | Liveness check. Returns `{ success, status, env, timestamp }`. |

## Not Yet Implemented

Planned per the blueprint (added to this table as each is built):

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/projects`
- `GET /api/projects`
- `POST /api/events`
- `GET /api/projects/:id/groups`
- `GET /api/groups/:id`
- `PATCH /api/groups/:id/status`