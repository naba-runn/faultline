import axios from 'axios';

// Single axios instance for all API calls. Base URL points at the
// Express API (see server/.env's CLIENT_ORIGIN / PORT — server runs on
// :5000, this client on :5173, per docs/API.md + server/.env.example).
const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
});

// Request interceptor — attaches the JWT (if present) to every
// outgoing request. Token is read fresh from localStorage on each
// request rather than captured once at module load, so a login/logout
// elsewhere in the app is picked up immediately without re-creating
// the instance.
api.interceptors.request.use(
    (requestConfig) => {
        const token = localStorage.getItem('faultline_token');
        if (token) {
            requestConfig.headers.Authorization = `Bearer ${token}`;
        }
        return requestConfig;
    },
    (error) => Promise.reject(error)
);

// Response interceptor — on any 401, the token is no longer usable
// (missing, expired, invalid signature, or the user was deleted — see
// docs/API.md's GET /api/auth/me error table for the three server-side
// cases folded into this one client-side outcome). Clearing it here,
// in one place, means every API call self-heals from a stale token
// instead of each call site handling it individually.
//
// This intentionally does NOT redirect or navigate — routing and
// ProtectedRoute land in Task 16. AuthContext (main.jsx-adjacent,
// added this task) is what reacts to the cleared token; this
// interceptor's only job is not leaving a dead token lying around.
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            localStorage.removeItem('faultline_token');
        }
        return Promise.reject(error);
    }
);

export default api;