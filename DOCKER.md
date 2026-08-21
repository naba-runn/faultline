# Docker (Task 39)

## Setup

```bash
cp .env.example .env
# fill in JWT_SECRET at minimum — GEMINI_API_KEY/GITHUB_TOKEN/
# RESEND_API_KEY are optional (see server/.env.example's existing
# comments on why each is opt-in)

docker compose up --build
```

Then open http://localhost — Nginx serves the client and proxies
`/api/*` to the API container.

## Manual verification (Task 39.5 — do this for real, don't skip)

A compose file that builds but was never run end-to-end doesn't count
as done, same standard as Task 25.5/26.5.

1. `docker compose up --build`, wait for all healthchecks to pass
   (`docker compose ps` — all should show `healthy`)
2. Open http://localhost, register a new dashboard account
3. Create a project, copy its API key
4. Point `demo-app` at the containerized API
   (`FAULTLINE_API_URL=http://localhost/api/events` in `demo-app/.env`
   — note: **not** `localhost:5000`, since the API isn't exposed on
   its own port outside the Docker network in this topology, only
   through Nginx on :80) and trigger a real error
5. Confirm the error appears on the dashboard, and — with a second
   browser tab open on the same project — confirm it appears **live**
   via SSE without a manual refresh (this specifically tests that
   `nginx.conf`'s `proxy_buffering off` on the SSE route is actually
   working; if it silently regresses, the dashboard would still show
   the error after a manual refresh, masking the bug — the two-tab
   live-update check is the only way this failure mode surfaces)
6. Confirm AI enrichment eventually populates (worker container logs
   should show the job being picked up — `docker compose logs worker`)

## Re-running the k6 load test (Task 39.6) against the containerized stack

```bash
# seed script needs its own MongoDB connection — point it at the
# containerized Mongo, exposed only inside the Docker network by
# default, so run it from a container or temporarily add a port
# mapping ("27017:27017") to mongo's service in docker-compose.yml
MONGODB_URI=mongodb://localhost:27017/faultline node server/loadtest/seedTestProjects.js 25

BASE_URL=http://localhost k6 run server/loadtest/ingest.js
```

Record the result in `docs/PERFORMANCE.md`'s "Containerized re-run"
section, alongside the dev-environment numbers from Task 38. A small
latency increase from container networking overhead is expected and
fine — don't chase eliminating it, just report it honestly.