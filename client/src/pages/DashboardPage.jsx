import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/axios.js';
import SdkSnippetGenerator from '../components/SdkSnippetGenerator.jsx';

// Real dashboard (Task 17), replacing Task 16's placeholder. Lists the
// user's projects (GET /api/projects) and lets them create a new one
// (POST /api/projects) — the only way to get a project + API key into
// the system at all, so it belongs here rather than waiting for a
// later task. Task 34 adds the SDK snippet generator for onboarding.
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
    const [newProjectName, setNewProjectName] = useState('');
    const [selectedSnippetProjectId, setSelectedSnippetProjectId] = useState(null);

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
        setNewProjectName('');

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
            setNewProjectName(project.name);
            setName('');
            setGithubRepo('');
        } catch (err) {
            setCreateError(err.response?.data?.error || 'Failed to create project.');
        } finally {
            setCreating(false);
        }
    }

    return (
        <div className="page">
            <header className="topbar">
                <h1>Faultline</h1>
                <p className="topbar-meta">
                    {user?.name}
                    {' · '}
                    <button type="button" className="btn-ghost" onClick={logout}>
                        Log out
                    </button>
                </p>
            </header>

            <section className="card">
                <h2>New project</h2>
                <form onSubmit={handleCreate}>
                    <div className="field">
                        <label htmlFor="project-name">Name</label>
                        <input
                            id="project-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>
                    <div className="field">
                        <label htmlFor="project-repo">GitHub repo (optional, owner/repo)</label>
                        <input
                            id="project-repo"
                            type="text"
                            value={githubRepo}
                            onChange={(e) => setGithubRepo(e.target.value)}
                            placeholder="owner/repo"
                        />
                    </div>
                    {createError && <p className="alert alert-error" role="alert">{createError}</p>}
                    <button type="submit" className="btn btn-primary" disabled={creating}>
                        {creating ? 'Creating...' : 'Create project'}
                    </button>
                </form>

                {newApiKey && (
                    <div className="alert alert-info" role="alert" style={{ marginTop: '1.25rem' }}>
                        <p style={{ margin: '0 0 0.5rem 0' }}>
                            <strong>Save this API key now — it will not be shown again:</strong>
                        </p>
                        <code className="api-key-reveal">{newApiKey}</code>
                        <div style={{ marginTop: '1rem' }}>
                            <strong>SDK Setup Snippet:</strong>
                            <SdkSnippetGenerator apiKey={newApiKey} projectName={newProjectName} />
                        </div>
                    </div>
                )}
            </section>

            <section>
                <h2>Your projects</h2>
                {loading && <p className="cell-muted">Loading projects...</p>}
                {!loading && loadError && <p className="alert alert-error" role="alert">{loadError}</p>}
                {!loading && !loadError && projects.length === 0 && (
                    <p className="cell-muted">No projects yet — create one above to get started.</p>
                )}
                {!loading && !loadError && projects.length > 0 && (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Project</th>
                                    <th>Repo</th>
                                    <th>Onboarding</th>
                                </tr>
                            </thead>
                            <tbody>
                                {projects.map((project) => (
                                    <tr key={project.id}>
                                        <td className="cell-message">
                                            <Link to={`/projects/${project.id}`}>{project.name}</Link>
                                        </td>
                                        <td className="cell-muted">{project.githubRepo || '—'}</td>
                                        <td>
                                            <button
                                                type="button"
                                                className="btn-tab"
                                                onClick={() =>
                                                    setSelectedSnippetProjectId(
                                                        selectedSnippetProjectId === project.id ? null : project.id
                                                    )
                                                }
                                            >
                                                {selectedSnippetProjectId === project.id ? 'Hide snippet' : 'SDK snippet'}
                                            </button>
                                            {selectedSnippetProjectId === project.id && (
                                                <div style={{ marginTop: '0.5rem' }}>
                                                    <SdkSnippetGenerator projectName={project.name} />
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}

export default DashboardPage;