# Faultline Client

React + Vite scaffold (Task 15). No real UI yet — that starts at Task
16 (Login/Register pages, `ProtectedRoute`).

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
- `src/App.jsx` — placeholder that only proves the wiring above works
  end-to-end. Replaced with real pages in Task 16.