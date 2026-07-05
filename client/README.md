# Faultline Client

React + Vite. Auth scaffold (Task 15) plus Login/Register/
`ProtectedRoute` (Task 16). Dashboard is still a placeholder — the
real project list / error group table lands in Task 17.

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
- `src/pages/DashboardPage.jsx` — placeholder behind `ProtectedRoute`,
  replaced with the real dashboard in Task 17.
- `src/App.jsx` — `react-router-dom` routes: `/login`, `/register`,
  `/dashboard` (protected); anything else redirects to `/dashboard`
  (which itself redirects to `/login` if not authenticated).