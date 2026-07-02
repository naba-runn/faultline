# Changelog

Format loosely follows [Keep a Changelog](https://keepachangelog.com/).
Entries are added per task, not per commit-within-a-task.

## [Unreleased]

### Added — Task 1: Monorepo init & Express skeleton
- Monorepo structure: `client/`, `server/`, `docs/`, `demo-app/`
- Express app (`server/app.js`) with helmet, CORS, 100kb JSON body
  cap, morgan request logging, `/health` endpoint, 404 handler, stub
  centralized error handler
- Server bootstrap (`server/server.js`) with unhandled rejection guard
- Environment config loader (`server/config/env.js`)
- `.env.example`, root `.gitignore`