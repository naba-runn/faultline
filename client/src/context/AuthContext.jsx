import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

const TOKEN_KEY = 'faultline_token';

const AuthContext = createContext(undefined);

// Holds the current dashboard-user auth state (JWT-based — the
// separate API-key auth used by ingestion, per docs/API.md, never
// touches this context). Wrap the app in <AuthProvider> once, at the
// top level.
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
    // True while the initial /api/auth/me check (below) is in flight, so
    // consumers (e.g. Task 16's ProtectedRoute) can avoid a flash of
    // "logged out" UI before that check resolves.
    const [loading, setLoading] = useState(true);

    // On mount, if a token was already in localStorage from a previous
    // session, verify it's still valid and fetch the user it belongs to.
    // A 401 here (any of API.md's three GET /api/auth/me error cases) is
    // handled by the axios response interceptor, which clears the stored
    // token — this effect just needs to fall through to "logged out."
    useEffect(() => {
        if (!token) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        api
            .get('/auth/me')
            .then((res) => {
                if (!cancelled) {
                    setUser(res.data.data.user);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setToken(null);
                    setUser(null);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
        // Intentionally only re-runs if `token` itself changes (login/
        // logout), not on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const login = useCallback(async (email, password) => {
        const res = await api.post('/auth/login', { email, password });
        const { user: loggedInUser, token: newToken } = res.data.data;
        localStorage.setItem(TOKEN_KEY, newToken);
        setToken(newToken);
        setUser(loggedInUser);
        return loggedInUser;
    }, []);

    const register = useCallback(async (name, email, password) => {
        const res = await api.post('/auth/register', { name, email, password });
        const { user: newUser, token: newToken } = res.data.data;
        localStorage.setItem(TOKEN_KEY, newToken);
        setToken(newToken);
        setUser(newUser);
        return newUser;
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
    }, []);

    const value = {
        user,
        token,
        loading,
        isAuthenticated: Boolean(token && user),
        login,
        register,
        logout,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (ctx === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return ctx;
}