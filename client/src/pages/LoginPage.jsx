import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// A flat baseline that settles after one small disturbance — the
// thing this whole product watches for, drawn once on load rather
// than looping. See .auth-trace-path's stroke-draw animation in
// index.css (respects prefers-reduced-motion via the global rule).
function TraceMark() {
    return (
        <svg className="auth-trace" viewBox="0 0 96 28" aria-hidden="true">
            <path
                className="auth-trace-path"
                d="M0 14 H30 L36 4 L42 24 L48 8 L54 14 H96"
            />
        </svg>
    );
}

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
        <div className="auth-shell">
            <div className="auth-panel">
                <div className="auth-mark">
                    <TraceMark />
                    <p className="auth-wordmark">FAULTLINE</p>
                </div>

                <div className="auth-copy">
                    <h1>Welcome back</h1>
                    <p>Sign in to monitor your telemetry.</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="field">
                        <label htmlFor="email">Email address</label>
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
                        <label htmlFor="password">Password</label>
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
                    <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
                        {submitting ? 'Logging in...' : 'Log in'}
                    </button>
                </form>

                <div className="auth-footer">
                    <span>Don't have an account?</span> <Link to="/register" className="auth-link">Register</Link>
                </div>
            </div>
        </div>
    );
}

export default LoginPage;
