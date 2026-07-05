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
        <div className="page-narrow">
            <h1>Faultline</h1>
            <p className="topbar-meta">Create your account.</p>
            <form onSubmit={handleSubmit}>
                <div className="field">
                    <label htmlFor="name">Name</label>
                    <input
                        id="name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                    />
                </div>
                <div className="field">
                    <label htmlFor="email">Email</label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
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
                        required
                    />
                </div>
                {error && <p className="alert alert-error" role="alert">{error}</p>}
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Registering...' : 'Register'}
                </button>
            </form>
            <p>
                Already have an account? <Link to="/login">Log in</Link>
            </p>
        </div>
    );
}

export default RegisterPage;