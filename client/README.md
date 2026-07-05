# Faultline Client

React + Vite. Auth scaffold (Task 15), Login/Register/`ProtectedRoute`
(Task 16), and the real Dashboard + ProjectDetail pages (Task 17).
ErrorGroupDetail (per-group AI panel, event list, sparkline) and
status-change UI are Tasks 18-19.

## Setup

```bash
cd client
npm install
cp .env.example .env   # edit VITE_API_BASE_URL if the API isn't on :5000
npm run dev            # starts on :5173, matching server/.env.example's CLIENT_ORIGIN
```

## What's here

- `src/api/axios.js` — single shared axios instance. Request
  interceptor attaches the JWT from `localStorage` to every call;
  response interceptor clears it on any `401` (see `docs/API.md`'s
  auth error tables for what a 401 means at each endpoint).
- `src/context/AuthContext.jsx` — `AuthProvider` + `useAuth()`. Holds
  `user`/`token`/`loading`/`isAuthenticated`, exposes
  `login`/`register`/`logout`. On mount, if a token is already in
  `localStorage`, calls `GET /api/auth/me` to validate it and load the
  user before rendering real content.
- `src/components/ProtectedRoute.jsx` — redirects to `/login` unless
  `isAuthenticated`; shows a loading state while the Task 15 bootstrap
  check is in flight rather than bouncing a logged-in user on refresh.
- `src/pages/LoginPage.jsx` / `RegisterPage.jsx` — forms wired to
  `AuthContext`'s `login`/`register`; surface the server's `error`
  message on failure (see `docs/API.md`'s auth error tables).
- `src/pages/DashboardPage.jsx` — lists the user's projects
  (`GET /api/projects`) and lets them create a new one
  (`POST /api/projects`), surfacing the one-time-only raw API key on
  success.
- `src/pages/ProjectDetailPage.jsx` — shows project info and its error
  group table (`GET /api/projects/:id` + the Task-17-added
  `GET /api/projects/:id/groups`). List view only — no drill-into-one-
  group detail page or status changes yet (Tasks 18-19).
- `src/App.jsx` — `react-router-dom` routes: `/login`, `/register`,
  `/dashboard` and `/projects/:id` (both protected); anything else
  redirects to `/dashboard` (which itself redirects to `/login` if not
  authenticated).