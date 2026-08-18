import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

export default function Navbar() {
    const { user, logout } = useAuth();
    const { theme, setTheme, toggleTheme, isDark } = useTheme();
    const location = useLocation();
    const navigate = useNavigate();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Close dropdown on outside click or Esc
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setDropdownOpen(false);
            }
        }
        function handleKeyDown(event) {
            if (event.key === 'Escape') {
                setDropdownOpen(false);
            }
        }
        if (dropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [dropdownOpen]);

    const handleProjectsClick = (e) => {
        if (location.pathname === '/dashboard') {
            e.preventDefault();
            const el = document.getElementById('projects-section');
            if (el) {
                el.scrollIntoView({ behavior: 'smooth' });
            }
        } else {
            navigate('/dashboard#projects-section');
        }
    };

    const isDashboardActive = location.pathname === '/dashboard' || location.pathname === '/';
    const isDocsActive = location.pathname === '/docs';
    const isProjectDetail = location.pathname.startsWith('/projects/');

    const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : 'U';

    return (
        <header className="topbar">
            <div className="topbar-left">
                <Link to="/dashboard" className="topbar-brand">
                    <span className="brand-logo-mark" aria-hidden="true" />
                    <span className="brand-logo-text">FAULTLINE</span>
                </Link>
                <nav className="topbar-nav" aria-label="Main Navigation">
                    <Link
                        to="/dashboard"
                        className={`topbar-link ${isDashboardActive && !isProjectDetail ? 'active' : ''}`}
                    >
                        Dashboard
                    </Link>
                    <a
                        href="/dashboard#projects-section"
                        onClick={handleProjectsClick}
                        className={`topbar-link ${isProjectDetail ? 'active' : ''}`}
                    >
                        Projects
                    </a>
                    <Link
                        to="/docs"
                        className={`topbar-link ${isDocsActive ? 'active' : ''}`}
                    >
                        API Docs
                    </Link>
                </nav>
            </div>

            <div className="topbar-right">
                {user ? (
                    <div className="topbar-user-menu" ref={dropdownRef}>
                        <button
                            type="button"
                            className={`user-menu-btn ${dropdownOpen ? 'open' : ''}`}
                            onClick={() => setDropdownOpen((prev) => !prev)}
                            aria-expanded={dropdownOpen}
                            aria-haspopup="menu"
                        >
                            <span className="user-avatar">{userInitial}</span>
                            <span className="user-name">{user.name}</span>
                            <svg
                                className={`user-menu-chevron ${dropdownOpen ? 'rotate' : ''}`}
                                width="12"
                                height="12"
                                viewBox="0 0 12 12"
                                fill="none"
                                aria-hidden="true"
                            >
                                <path
                                    d="M2.5 4.5L6 8L9.5 4.5"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </button>

                        {dropdownOpen && (
                            <div className="user-dropdown-menu" role="menu">
                                <div className="user-dropdown-header">
                                    <div className="user-dropdown-name">{user.name}</div>
                                    <div className="user-dropdown-email">{user.email}</div>
                                </div>

                                <div className="user-dropdown-divider" />

                                <div className="user-dropdown-item theme-switcher-item">
                                    <span className="dropdown-item-label">Theme</span>
                                    <div className="theme-toggle-group" role="radiogroup" aria-label="Theme selection">
                                        <button
                                            type="button"
                                            className={`theme-toggle-btn ${!isDark ? 'active' : ''}`}
                                            onClick={() => setTheme('light')}
                                            title="Light mode"
                                            aria-label="Light mode"
                                            aria-checked={!isDark}
                                            role="radio"
                                        >
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="12" r="5" />
                                                <line x1="12" y1="1" x2="12" y2="3" />
                                                <line x1="12" y1="21" x2="12" y2="23" />
                                                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                                                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                                                <line x1="1" y1="12" x2="3" y2="12" />
                                                <line x1="21" y1="12" x2="23" y2="12" />
                                                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                                                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                                            </svg>
                                            <span>Light</span>
                                        </button>
                                        <button
                                            type="button"
                                            className={`theme-toggle-btn ${isDark ? 'active' : ''}`}
                                            onClick={() => setTheme('dark')}
                                            title="Dark mode"
                                            aria-label="Dark mode"
                                            aria-checked={isDark}
                                            role="radio"
                                        >
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                                            </svg>
                                            <span>Dark</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="user-dropdown-divider" />

                                <Link
                                    to="/docs"
                                    className="user-dropdown-item clickable-item"
                                    onClick={() => setDropdownOpen(false)}
                                    role="menuitem"
                                >
                                    <span>API Reference</span>
                                </Link>

                                <div className="user-dropdown-divider" />

                                <button
                                    type="button"
                                    className="user-dropdown-item clickable-item logout-item"
                                    onClick={() => {
                                        setDropdownOpen(false);
                                        logout();
                                    }}
                                    role="menuitem"
                                >
                                    <span>Log out</span>
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="topbar-auth-links">
                        <Link to="/login" className="btn btn-ghost btn-sm">Log in</Link>
                        <Link to="/register" className="btn btn-primary btn-sm">Register</Link>
                    </div>
                )}
            </div>
        </header>
    );
}
