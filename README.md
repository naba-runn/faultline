# Faultline

An AI-grounded error intelligence platform — a scoped-down Sentry.
Client apps report runtime errors to an ingestion API; Faultline
deduplicates them via stack-trace fingerprinting and, once per new
error group, calls Gemini (grounded in the actual offending source
file) to produce a structured root-cause summary.

**Status: under active development.** See `docs/PROJECT_CONTEXT.md`
for exactly where things stand.

## Project Structure

```
client/     React dashboard (not yet scaffolded)
server/     Express API
demo-app/   Sample app that throws errors into the ingestion endpoint
docs/       Living project documentation — read PROJECT_CONTEXT.md first
```

## Local Setup (server)

```bash
cd server
npm install
cp .env.example .env
npm run dev
```
> **Local environment note:** if port 5000 is unavailable on your
> machine, set `PORT=5050` (or any free port) in `.env` — `.env.example`
> and `env.js`'s fallback intentionally still default to `5000`.

Health check: `GET http://localhost:5000/health`

## Documentation

- `docs/PROJECT_CONTEXT.md` — current state, start here
- `docs/TASKS.md` — full task breakdown
- `docs/ARCHITECTURE.md` — folder structure & layering rules
- `docs/DATABASE.md` — schema design
- `docs/AI_CONTEXT.md` — AI integration design decisions
- `docs/API.md` — endpoint reference
- `docs/CHANGELOG.md` — what's been built, in order

Full setup instructions, screenshots, and architecture write-up will
be expanded here as the project nears completion (final task on the
roadmap).