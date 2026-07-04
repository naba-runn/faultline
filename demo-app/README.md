# Faultline Demo App

A minimal Express app whose only purpose is to throw a few sample
errors and forward them to Faultline's ingestion endpoint, so dedup
behavior can be verified manually end-to-end. Not part of Faultline
itself — a client integration example.

## Setup

```bash
cd demo-app
npm install
cp .env.example .env
```

Edit `.env` and set:

| Variable | Required | Meaning |
|---|---|---|
| `PORT` | No (default `4000`) | Port this app listens on. |
| `FAULTLINE_API_URL` | Yes | Full URL of your Faultline server's ingestion endpoint, e.g. `http://localhost:5050/api/events`. |
| `FAULTLINE_API_KEY` | Yes | A real `flt_`-prefixed API key from a Faultline project (created via `POST /api/projects` against your running server). Without this, errors are logged locally but never reported. |

```bash
npm start
```

## Routes

| Route | Behavior |
|---|---|
| `GET /` | Lists available crash routes; not itself an error. |
| `GET /crash/type-error` | Throws a `TypeError`. |
| `GET /crash/range-error` | Throws a `RangeError`. |
| `GET /crash/custom` | Throws a plain `Error` with a custom message. |

## How It Reports to Faultline

Each route's thrown error is caught by an Express error-handling
middleware, which fire-and-forgets a `POST` to `FAULTLINE_API_URL`
with:

```json
{
  "message": "<err.message>",
  "stack": "<err.stack>",
  "env": "development",
  "metadata": { "source": "demo-app" }
}
```

authenticated via `Authorization: Bearer <FAULTLINE_API_KEY>`. The
demo app's own response to the crashing request (`500`) is not
affected by whether the report to Faultline succeeds or fails — this
mirrors Faultline's own fire-and-forget philosophy: a client app's
error reporting should never make its own failures worse.

## Verifying Dedup Manually

Hit the same route repeatedly (e.g. `curl` in a loop, or refresh a few
times) and check your Faultline project's error groups: repeated hits
on one route should collapse into a single `ErrorGroup` with an
incrementing `count`. Hitting different routes should produce
separate `ErrorGroup` documents — each with its own distinct
fingerprint.
