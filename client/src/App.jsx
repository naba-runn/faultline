import { useAuth } from './context/AuthContext.jsx';

// Placeholder root component for Task 15. Only exists to prove
// AuthContext + the axios instance are wired correctly end-to-end
// (the /api/auth/me bootstrap check on mount). Login/Register pages
// and ProtectedRoute land in Task 16 — this is deliberately not a
// real UI yet.
function App() {
    const { user, loading, isAuthenticated } = useAuth();

    if (loading) {
        return <p>Checking auth status...</p>;
    }

    return (
        <div>
            <h1>Faultline</h1>
            <p>
                Auth scaffold check — isAuthenticated: {String(isAuthenticated)}
                {user ? ` (logged in as ${user.name})` : ' (no session)'}
            </p>
        </div>
    );
}

export default App;