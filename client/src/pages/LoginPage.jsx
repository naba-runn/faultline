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
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-brand">
                    <div className="auth-brand-logo">
                        <span className="brand-dot" />
                        <h1>FAULTLINE</h1>
                    </div>
                    <p className="auth-tagline">Understand errors before they become incidents.</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="field">
                        <label htmlFor="email">Email address</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="developer@company.com"
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
                        {submitting ? 'Logging in...' : 'Log in to Dashboard →'}
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