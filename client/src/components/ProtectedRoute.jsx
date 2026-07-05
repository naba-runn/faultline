import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Gates a route on auth state from AuthContext (Task 15). While the
// initial GET /api/auth/me bootstrap check is still in flight, render
// nothing meaningful yet rather than bouncing to /login — that would
// wrongly kick out an already-logged-in user on every page refresh
// while the check resolves.
function ProtectedRoute({ children }) {
    const { isAuthenticated, loading } = useAuth();

    if (loading) {
        return <p>Checking auth status...</p>;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return children;
}

export default ProtectedRoute;