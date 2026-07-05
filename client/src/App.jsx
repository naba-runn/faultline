import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ProjectDetailPage from './pages/ProjectDetailPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

// Task 17 adds the real Dashboard (project list + create form) and
// ProjectDetail (error group table), replacing Task 16's Dashboard
// placeholder. ErrorGroupDetail (a per-group page) is Task 19 — not
// added here.
function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
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
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;