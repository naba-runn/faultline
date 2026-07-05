import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/axios.js';

// Real dashboard (Task 17), replacing Task 16's placeholder. Lists the
// user's projects (GET /api/projects) and lets them create a new one
// (POST /api/projects) — the only way to get a project + API key into
// the system at all, so it belongs here rather than waiting for a
// later task.
function DashboardPage() {
    const { user, logout } = useAuth();

    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    const [name, setName] = useState('');
    const [githubRepo, setGithubRepo] = useState('');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState('');
    // Shown once after a successful create, since the raw API key
    // (docs/API.md: "returned exactly once — it is not recoverable
    // afterward") would otherwise be lost forever.
    const [newApiKey, setNewApiKey] = useState(null);

    const fetchProjects = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const res = await api.get('/projects');
            setProjects(res.data.data.projects);
        } catch (err) {
            setLoadError(err.response?.data?.error || 'Failed to load projects.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    async function handleCreate(e) {
        e.preventDefault();
        setCreateError('');
        setCreating(true);
        setNewApiKey(null);

        try {
            const res = await api.post('/projects', {
                name,
                // API.md: githubRepo is optional — send undefined rather than
                // an empty string so the server's own "not provided" branch
                // handles it instead of the owner/repo-format validator.
                githubRepo: githubRepo.trim() || undefined,
            });
            const { project, apiKey } = res.data.data;
            setProjects((prev) => [project, ...prev]);
            setNewApiKey(apiKey);
            setName('');
            setGithubRepo('');
        } catch (err) {
            setCreateError(err.response?.data?.error || 'Failed to create project.');
        } finally {
            setCreating(false);
        }
    }

    return (
        <div>
            <header>
                <h1>Dashboard</h1>
                <p>
                    Logged in as {user?.name}.{' '}
                    <button type="button" onClick={logout}>
                        Log out
                    </button>
                </p>
            </header>

            <section>
                <h2>New project</h2>
                <form onSubmit={handleCreate}>
                    <div>
                        <label htmlFor="project-name">Name</label>
                        <input
                            id="project-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="project-repo">GitHub repo (optional, owner/repo)</label>
                        <input
                            id="project-repo"
                            type="text"
                            value={githubRepo}
                            onChange={(e) => setGithubRepo(e.target.value)}
                            placeholder="owner/repo"
                        />
                    </div>
                    {createError && <p role="alert">{createError}</p>}
                    <button type="submit" disabled={creating}>
                        {creating ? 'Creating...' : 'Create project'}
                    </button>
                </form>

                {newApiKey && (
                    <div role="alert">
                        <p>
                            <strong>Save this API key now — it will not be shown again:</strong>
                        </p>
                        <code>{newApiKey}</code>
                    </div>
                )}
            </section>

            <section>
                <h2>Your projects</h2>
                {loading && <p>Loading projects...</p>}
                {!loading && loadError && <p role="alert">{loadError}</p>}
                {!loading && !loadError && projects.length === 0 && (
                    <p>No projects yet — create one above to get started.</p>
                )}
                {!loading && !loadError && projects.length > 0 && (
                    <ul>
                        {projects.map((project) => (
                            <li key={project.id}>
                                <Link to={`/projects/${project.id}`}>{project.name}</Link>
                                {project.githubRepo && <span> ({project.githubRepo})</span>}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

export default DashboardPage;