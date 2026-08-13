import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setSubmitting(true);

        try {
            await login(email, password);
            navigate('/dashboard');
        } catch (err) {
            // docs/API.md: both the 400 (missing fields) and 401 (bad
            // credentials) cases return { success: false, error: "<msg>" }.
            // Falling back to a generic message covers network failures /
            // unexpected shapes without throwing inside the catch block.
            const message = err.response?.data?.error || 'Login failed. Please try again.';
            setError(message);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="auth-stitch-container">
            <div className="auth-stitch-card">
                {/* Left Panel: Context & Live Stream Preview */}
                <div className="auth-left-panel">
                    <div>
                        <div className="auth-brand-header">
                            <span className="material-symbols-outlined text-primary text-[28px]" style={{ color: 'var(--color-accent)' }}>warning</span>
                            <h1 className="brand-title">FAULTLINE</h1>
                        </div>
                        <h2 className="auth-headline">
                            Understand runtime errors before they become incidents.
                        </h2>
                        <ul className="auth-feature-list">
                            <li>
                                <span className="material-symbols-outlined text-primary text-[18px]" style={{ color: 'var(--color-accent)' }}>check_circle</span>
                                <span>Real-time error tracking</span>
                            </li>
                            <li>
                                <span className="material-symbols-outlined text-primary text-[18px]" style={{ color: 'var(--color-accent)' }}>psychology</span>
                                <span>AI-grounded root-cause analysis</span>
                            </li>
                            <li>
                                <span className="material-symbols-outlined text-primary text-[18px]" style={{ color: 'var(--color-accent)' }}>bug_report</span>
                                <span>Production-aware debugging</span>
                            </li>
                        </ul>
                    </div>

                    <div className="auth-terminal-box mono">
                        <div className="terminal-line">
                            <span className="dot-red" />
                            <span className="text-red font-bold">NEW ERROR</span>
                            <span className="dim">→</span>
                            <span>TypeError: undefined is not a function</span>
                        </div>
                        <div className="terminal-line indent">
                            <span className="dim">⚡ GROUPED →</span>
                            <span>Cluster: 42 occurrences / 5 min</span>
                        </div>
                        <div className="terminal-line indent">
                            <span className="text-warning">🧠 AI ANALYZING →</span>
                            <span>Trace analysis in progress...</span>
                        </div>
                        <div className="terminal-line indent">
                            <span className="text-teal font-bold">✓ ROOT CAUSE FOUND →</span>
                            <span>utils.js:145</span>
                        </div>
                    </div>
                </div>

                {/* Right Panel: Form */}
                <div className="auth-right-panel">
                    <div className="auth-form-header">
                        <h3>Welcome back</h3>
                        <p>Sign in to monitor your telemetry.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="auth-form">
                        <div className="field">
                            <label htmlFor="email" className="font-label-caps">Email Address</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="user@domain.com"
                                required
                            />
                        </div>
                        <div className="field">
                            <label htmlFor="password" className="font-label-caps">Password</label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                            />
                        </div>
                        {error && <p className="alert alert-error" role="alert">{error}</p>}
                        <button type="submit" className="btn btn-primary btn-full flex-center gap-xs" disabled={submitting}>
                            <span>{submitting ? 'Logging in...' : 'Log in'}</span>
                            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                        </button>
                    </form>

                    <div className="auth-footer">
                        <span>Don't have an account?</span> <Link to="/register" className="auth-link">Register</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default LoginPage;