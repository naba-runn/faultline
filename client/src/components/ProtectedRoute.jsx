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
        return (
            <div className="page">
                <header className="topbar">
                    <div className="topbar-left">
                        <div className="topbar-brand">
                            <h1 className="brand-logo-text">FAULTLINE</h1>
                        </div>
                    </div>
                </header>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return children;
}

export default ProtectedRoute;