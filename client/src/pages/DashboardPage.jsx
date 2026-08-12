import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/axios.js';
import SdkSnippetGenerator from '../components/SdkSnippetGenerator.jsx';

// Task 36: Dashboard overview redesign with overview metric cards,
// project summary badges (repo, alerts, actions), and refined layout.
function DashboardPage() {
    const { user, logout } = useAuth();

    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    const [name, setName] = useState('');
    const [githubRepo, setGithubRepo] = useState('');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState('');

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

    const reposLinkedCount = useMemo(() => {
        return projects.filter((p) => Boolean(p.githubRepo)).length;
    }, [projects]);

    return (
        <div className="page">
            <header className="topbar">
                <div>
                    <h1 style={{ margin: 0 }}>Faultline</h1>
                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                        Real-time error tracking & AI root-cause intelligence
                    </p>
                </div>
                <p className="topbar-meta">
                    <Link to="/docs" style={{ color: 'var(--color-accent)', fontWeight: 500 }}>API Docs</Link>
                    {' · '}
                    <span className="mono" style={{ color: 'var(--color-text)' }}>{user?.name}</span>
                    {' · '}
                    <button type="button" className="btn-ghost" onClick={logout}>
                        Log out
                    </button>
                </p>
            </header>

            {/* Overview Stat Cards */}
            <div className="metrics-overview-grid">
                <div className="stat-card">
                    <span className="stat-label">Total Projects</span>
                    <span className="stat-value">{projects.length}</span>
                    <span className="stat-meta">Active applications monitored</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Connected Repositories</span>
                    <span className="stat-value">{reposLinkedCount}</span>
                    <span className="stat-meta">Grounded with GitHub code context</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Ingestion Pipeline</span>
                    <span className="stat-value" style={{ color: 'var(--color-accent)' }}>Operational</span>
                    <span className="stat-meta">Real-time SSE & BullMQ worker active</span>
                </div>
            </div>

            <section className="card" style={{ marginTop: '1.5rem' }}>
                <h2 style={{ marginTop: 0 }}>Create new project</h2>
                <form onSubmit={handleCreate} className="create-project-form">
                    <div className="field" style={{ margin: 0 }}>
                        <label htmlFor="project-name">Project Name</label>
                        <input
                            id="project-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. My Web App"
                            required
                        />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                        <label htmlFor="project-repo">GitHub Repo (optional)</label>
                        <input
                            id="project-repo"
                            type="text"
                            value={githubRepo}
                            onChange={(e) => setGithubRepo(e.target.value)}
                            placeholder="owner/repo"
                        />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={creating} style={{ height: '38px' }}>
                        {creating ? 'Creating...' : '+ Create project'}
                    </button>
                </form>
                {createError && <p className="alert alert-error" role="alert" style={{ marginTop: '1rem' }}>{createError}</p>}

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

            <section style={{ marginTop: '2rem' }}>
                <h2 style={{ marginTop: 0 }}>Your Projects</h2>
                {loading && <p className="cell-muted">Loading projects...</p>}
                {!loading && loadError && <p className="alert alert-error" role="alert">{loadError}</p>}
                {!loading && !loadError && projects.length === 0 && (
                    <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
                        <p className="cell-muted" style={{ fontSize: '1rem', margin: 0 }}>
                            No projects monitored yet. Create a project above to generate your ingestion API key.
                        </p>
                    </div>
                )}
                {!loading && !loadError && projects.length > 0 && (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Project Name</th>
                                    <th>GitHub Repository</th>
                                    <th>Created</th>
                                    <th>Integration</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {projects.map((project) => (
                                    <tr key={project.id}>
                                        <td className="cell-message">
                                            <Link to={`/projects/${project.id}`} style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                                                {project.name}
                                            </Link>
                                        </td>
                                        <td>
                                            {project.githubRepo ? (
                                                <span className="badge-repo mono">{project.githubRepo}</span>
                                            ) : (
                                                <span className="cell-muted">No repo linked</span>
                                            )}
                                        </td>
                                        <td className="cell-muted mono" style={{ fontSize: '0.8rem' }}>
                                            {new Date(project.createdAt).toLocaleDateString(undefined, {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                            })}
                                        </td>
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
                                                {selectedSnippetProjectId === project.id ? 'Hide SDK Code' : 'SDK Snippet'}
                                            </button>
                                            {selectedSnippetProjectId === project.id && (
                                                <div style={{ marginTop: '0.75rem' }}>
                                                    <SdkSnippetGenerator projectName={project.name} />
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <Link
                                                to={`/projects/${project.id}`}
                                                className="btn btn-primary"
                                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                                            >
                                                View Errors →
                                            </Link>
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