import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    Layers,
    BookOpen,
    LogOut,
    Sun,
    Moon,
    Activity,
    Plus,
    ChevronRight,
    Menu,
    X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import api from '../api/axios.js';

export default function Sidebar({ currentProjectId }) {
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const location = useLocation();
    const navigate = useNavigate();
    const [projects, setProjects] = useState([]);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        let mounted = true;
        api.get('/projects')
            .then((res) => {
                const list = res.data?.data?.projects || (Array.isArray(res.data) ? res.data : []);
                if (mounted && Array.isArray(list)) {
                    setProjects(list.slice(0, 8)); // Top 8 projects for sidebar
                }
            })
            .catch(() => {});
        return () => {
            mounted = false;
        };
    }, [location.pathname]);

    // Close mobile drawer when route changes
    useEffect(() => {
        setMobileOpen(false);
    }, [location.pathname]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const userInitial = (user?.name || user?.email || 'U').charAt(0).toUpperCase();

    return (
        <>
            {/* Mobile Header Bar */}
            <div className="mobile-topbar">
                <div className="mobile-brand">
                    <span className="brand-fault-mark">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 4l7 9-3 7" />
                            <path d="M20 4l-7 9 3 7" />
                        </svg>
                    </span>
                    <span className="brand-wordmark">FAULTLINE</span>
                </div>
                <button
                    type="button"
                    className="mobile-nav-toggle"
                    onClick={() => setMobileOpen(!mobileOpen)}
                    aria-label="Toggle navigation"
                >
                    {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
            </div>

            {/* Mobile Backdrop */}
            {mobileOpen && (
                <div
                    className="sidebar-backdrop"
                    onClick={() => setMobileOpen(false)}
                    aria-hidden="true"
                />
            )}

            {/* Main Sidebar */}
            <aside className={`app-sidebar ${mobileOpen ? 'open' : ''}`}>
                {/* Brand Header */}
                <div className="sidebar-brand-section">
                    <NavLink to="/dashboard" className="sidebar-brand-link">
                        <div className="brand-fault-mark">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 4l7 9-3 7" />
                                <path d="M20 4l-7 9 3 7" />
                            </svg>
                        </div>
                        <div className="brand-text-col">
                            <span className="brand-wordmark">FAULTLINE</span>
                            <span className="brand-subtext">Observability</span>
                        </div>
                    </NavLink>
                </div>

                {/* Main Navigation */}
                <div className="sidebar-content">
                    <div className="sidebar-nav-group">
                        <div className="sidebar-group-title">Navigation</div>
                        <nav className="sidebar-nav">
                            <NavLink
                                to="/dashboard"
                                className={({ isActive }) =>
                                    `sidebar-nav-item ${isActive && location.pathname === '/dashboard' ? 'active' : ''}`
                                }
                            >
                                <LayoutDashboard size={17} className="nav-icon" />
                                <span className="nav-label">Dashboard</span>
                            </NavLink>

                            <NavLink
                                to="/docs"
                                className={({ isActive }) =>
                                    `sidebar-nav-item ${isActive ? 'active' : ''}`
                                }
                            >
                                <BookOpen size={17} className="nav-icon" />
                                <span className="nav-label">API Docs</span>
                            </NavLink>
                        </nav>
                    </div>

                    {/* Projects Section */}
                    <div className="sidebar-nav-group">
                        <div className="sidebar-group-header">
                            <span className="sidebar-group-title">Monitored Projects</span>
                            <NavLink to="/dashboard" className="sidebar-add-btn" title="Onboard new project">
                                <Plus size={13} />
                            </NavLink>
                        </div>

                        <div className="sidebar-projects-list">
                            {projects.length === 0 ? (
                                <div className="sidebar-empty-projects">
                                    <span>No projects yet</span>
                                </div>
                            ) : (
                                projects.map((p) => {
                                    const pid = p.id || p._id;
                                    const repo = p.githubRepo || p.repo;
                                    const isCurrent = currentProjectId === pid || location.pathname === `/projects/${pid}`;
                                    return (
                                        <NavLink
                                            key={pid}
                                            to={`/projects/${pid}`}
                                            className={`sidebar-project-item ${isCurrent ? 'active' : ''}`}
                                            title={p.name}
                                        >
                                            <span className="project-status-dot" />
                                            <span className="project-name-text">{p.name}</span>
                                            {repo && (
                                                <span className="project-repo-tag" title={repo}>
                                                    {repo.split('/')[1] || repo}
                                                </span>
                                            )}
                                        </NavLink>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* User & Preferences Footer */}
                <div className="sidebar-footer">
                    <div className="user-profile-row">
                        <div className="user-avatar" title={user?.name || user?.email}>
                            {userInitial}
                        </div>
                        <div className="user-info">
                            <span className="user-name">{user?.name || 'Developer'}</span>
                            <span className="user-email">{user?.email || 'authenticated'}</span>
                        </div>
                        <div className="user-actions">
                            <button
                                type="button"
                                className="sidebar-icon-btn"
                                onClick={toggleTheme}
                                title={theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
                                aria-label="Toggle theme"
                            >
                                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                            </button>
                            <button
                                type="button"
                                className="sidebar-icon-btn"
                                onClick={handleLogout}
                                title="Sign out"
                                aria-label="Sign out"
                            >
                                <LogOut size={15} />
                            </button>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
}
