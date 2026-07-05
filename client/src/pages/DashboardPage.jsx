import { useAuth } from '../context/AuthContext.jsx';

// Placeholder landing page behind ProtectedRoute. Replaced with the
// real project list / error group table in Task 17 — this only exists
// so Task 16 has a real destination to route to and log out from.
function DashboardPage() {
    const { user, logout } = useAuth();

    return (
        <div>
            <h1>Dashboard</h1>
            <p>Logged in as {user?.name}.</p>
            <button type="button" onClick={logout}>
                Log out
            </button>
        </div>
    );
}

export default DashboardPage;