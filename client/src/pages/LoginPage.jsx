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
        <div>
            <h1>Log in</h1>
            <form onSubmit={handleSubmit}>
                <div>
                    <label htmlFor="email">Email</label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div>
                    <label htmlFor="password">Password</label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                {error && <p role="alert">{error}</p>}
                <button type="submit" disabled={submitting}>
                    {submitting ? 'Logging in...' : 'Log in'}
                </button>
            </form>
            <p>
                No account? <Link to="/register">Register</Link>
            </p>
        </div>
    );
}

export default LoginPage;