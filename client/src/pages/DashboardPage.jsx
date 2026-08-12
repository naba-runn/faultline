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
                <div className="topbar-brand">
                    <span className="brand-dot" />
                    <div>
                        <h1 style={{ margin: 0 }}>FAULTLINE</h1>
                        <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                            Real-time error tracking & AI root-cause intelligence
                        </p>
                    </div>
                </div>
                <div className="topbar-meta">
                    <Link to="/docs" className="topbar-link">API Docs</Link>
                    <span className="topbar-divider">/</span>
                    <span className="mono topbar-user">{user?.name}</span>
                    <span className="topbar-divider">/</span>
                    <button type="button" className="btn-ghost" onClick={logout}>
                        Log out
                    </button>
                </div>
            </header>

            {/* Overview Stat Cards */}
            <div className="metrics-overview-grid">
                <div className="stat-card">
                    <span className="stat-label">Monitored Projects</span>
                    <span className="stat-value">{projects.length}</span>
                    <span className="stat-meta">Active applications</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">GitHub Grounding</span>
                    <span className="stat-value">{reposLinkedCount} <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>/ {projects.length}</span></span>
                    <span className="stat-meta">Code snippet context enabled</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Ingestion System</span>
                    <span className="stat-value text-accent" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span className="live-indicator-dot" style={{ background: 'var(--color-accent)' }} /> Operational
                    </span>
                    <span className="stat-meta">Real-time SSE & Queue worker ready</span>
                </div>
            </div>

            <section className="card card-accented" style={{ marginTop: '1.75rem' }}>
                <div className="section-header">
                    <h2>Connect an Application</h2>
                    <p className="section-subtitle">Create a project to generate your ingestion API key and begin capturing runtime errors.</p>
                </div>
                <form onSubmit={handleCreate} className="create-project-form">
                    <div className="field" style={{ margin: 0 }}>
                        <label htmlFor="project-name">Project Name</label>
                        <input
                            id="project-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Payments Microservice"
                            required
                        />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                        <label htmlFor="project-repo">GitHub Repository <span className="label-opt">(optional)</span></label>
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
                            <strong>SDK Onboarding Snippet:</strong>
                            <SdkSnippetGenerator apiKey={newApiKey} projectName={newProjectName} />
                        </div>
                    </div>
                )}
            </section>

            <section style={{ marginTop: '2.25rem' }}>
                <div className="section-header-inline">
                    <h2>Monitored Projects</h2>
                    <span className="mono-count">{projects.length} total</span>
                </div>

                {loading && <p className="cell-muted">Loading projects...</p>}
                {!loading && loadError && <p className="alert alert-error" role="alert">{loadError}</p>}
                {!loading && !loadError && projects.length === 0 && (
                    <div className="card empty-state-card">
                        <h3>No projects monitored yet</h3>
                        <p className="cell-muted">
                            Create your first project above to generate an API key and start monitoring runtime stack traces.
                        </p>
                    </div>
                )}
                {!loading && !loadError && projects.length > 0 && (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>PROJECT</th>
                                    <th>GITHUB REPO</th>
                                    <th>CREATED</th>
                                    <th>INTEGRATION</th>
                                    <th style={{ textAlign: 'right' }}>ACTION</th>
                                </tr>
                            </thead>
                            <tbody>
                                {projects.map((project) => (
                                    <tr key={project.id} className="row-hoverable">
                                        <td className="cell-message">
                                            <Link to={`/projects/${project.id}`} className="project-title-link">
                                                {project.name}
                                            </Link>
                                        </td>
                                        <td>
                                            {project.githubRepo ? (
                                                <span className="badge-repo mono">{project.githubRepo}</span>
                                            ) : (
                                                <span className="cell-muted" style={{ fontSize: '0.8rem' }}>No repo linked</span>
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
                                                className="btn btn-secondary btn-sm"
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