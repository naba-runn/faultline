import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AppLayout from './AppLayout.jsx';

function ProtectedRoute({ children }) {
    const { isAuthenticated, loading } = useAuth();

    if (loading) {
        return (
            <AppLayout>
                <div className="page-loading-state">
                    <div className="loading-spinner" />
                </div>
            </AppLayout>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return children;
}

export default ProtectedRoute;