import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// See LoginPage.jsx for what this draws and why.
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
        <div className="auth-shell">
            <div className="auth-panel">
                <div className="auth-mark">
                    <TraceMark />
                    <p className="auth-wordmark">FAULTLINE</p>
                </div>

                <div className="auth-copy">
                    <h1>Create account</h1>
                    <p>Start monitoring runtime errors with grounded root-cause analysis.</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="field">
                        <label htmlFor="name">Full name</label>
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
                            minLength={8}
                            required
                        />
                    </div>
                    {error && <p className="alert alert-error" role="alert">{error}</p>}
                    <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
                        {submitting ? 'Creating account...' : 'Create account'}
                    </button>
                </form>

                <div className="auth-footer">
                    <span>Already have an account?</span> <Link to="/login" className="auth-link">Log in</Link>
                </div>
            </div>
        </div>
    );
}

export default RegisterPage;
