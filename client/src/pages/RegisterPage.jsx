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
        <div className="auth-stitch-container">
            <div className="auth-stitch-card">
                {/* Left Panel: Context */}
                <div className="auth-left-panel">
                    <div>
                        <div className="auth-brand-header">
                            <span className="brand-dot-pulse" />
                            <h1 className="brand-title">FAULTLINE</h1>
                        </div>
                        <h2 className="auth-headline">
                            Start monitoring applications with AI root-cause intelligence.
                        </h2>
                        <ul className="auth-feature-list">
                            <li>
                                <span className="feature-icon">✓</span>
                                <span>Real-time error tracking</span>
                            </li>
                            <li>
                                <span className="feature-icon">🧠</span>
                                <span>AI-grounded root-cause analysis</span>
                            </li>
                            <li>
                                <span className="feature-icon">🐞</span>
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
                        <h3>Create account</h3>
                        <p>Get started with real-time error telemetry.</p>
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
                            <label htmlFor="email">Email Address</label>
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
                            {submitting ? 'Creating Account...' : 'Create Account →'}
                        </button>
                    </form>

                    <div className="auth-footer">
                        <span>Already have an account?</span> <Link to="/login" className="auth-link">Log in</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default RegisterPage;