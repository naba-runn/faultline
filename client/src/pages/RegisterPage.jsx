import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

function RegisterPage() {
    const { register } = useAuth();
    const navigate = useNavigate();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setSubmitting(true);

        try {
            await register(name, email, password);
            navigate('/dashboard');
        } catch (err) {
            // docs/API.md: 400 (missing fields / validation) and 409
            // (duplicate email) both return { success: false, error: "<msg>" }.
            const message = err.response?.data?.error || 'Registration failed. Please try again.';
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
                    <p className="auth-tagline">Start monitoring applications with AI root-cause intelligence.</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="field">
                        <label htmlFor="name">Full Name</label>
                        <input
                            id="name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Nabarun Dey"
                            required
                        />
                    </div>
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
                        {submitting ? 'Creating Account...' : 'Create Account →'}
                    </button>
                </form>

                <div className="auth-footer">
                    <span>Already have an account?</span> <Link to="/login" className="auth-link">Log in</Link>
                </div>

                <div className="auth-features">
                    <span className="feature-pill">⚡ Real-time Ingestion</span>
                    <span className="feature-pill">🧠 AI Root-Cause</span>
                    <span className="feature-pill">📡 Live SSE Stream</span>
                </div>
            </div>
        </div>
    );
}

export default RegisterPage;