import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ProjectDetailPage from './pages/ProjectDetailPage.jsx';
import GroupDetailPage from './pages/GroupDetailPage.jsx';
import IncidentDetailPage from './pages/IncidentDetailPage.jsx';
import ApiDocsPage from './pages/ApiDocsPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

// Task 17 added the real Dashboard (project list + create form) and
// ProjectDetail (error group table), replacing Task 16's Dashboard
// placeholder. Task 19 adds ErrorGroupDetail (a per-group page).
// Task 35 adds public API docs page at /docs.
function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/docs" element={<ApiDocsPage />} />
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute>
                            <DashboardPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/projects/:id"
                    element={
                        <ProtectedRoute>
                            <ProjectDetailPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/groups/:id"
                    element={
                        <ProtectedRoute>
                            <GroupDetailPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/incidents/:id"
                    element={
                        <ProtectedRoute>
                            <IncidentDetailPage />
                        </ProtectedRoute>
                    }
                />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;