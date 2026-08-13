import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/axios.js';
import SdkSnippetGenerator from '../components/SdkSnippetGenerator.jsx';

function formatRelativeTime(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.round(diffMs / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
}

function formatHourLabel(iso) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric' });
}

// Task 36: 25-point hourly bar chart (trailing 24h + in-progress
// current hour) for GET /api/projects/overview's `trend.series`. A
// plain inline SVG rather than a charting library — no chart
// dependency exists anywhere else in this client (Task 35's `marked`
// is the only doc-rendering addition so far), and 25 bars is simple
// enough that pulling in recharts/d3 for one dashboard widget would
// be exactly the premature-dependency PROJECT_RULES.md §2 argues
// against for a solo portfolio project.
function TrendChart({ series }) {
    const maxCount = Math.max(1, ...series.map((b) => b.count));
    const width = 700;
    const height = 140;
    const barGap = 3;
    const barWidth = (width - barGap * (series.length - 1)) / series.length;

    return (
        <svg
            viewBox={`0 0 ${width} ${height + 24}`}
            className="trend-chart-svg"
            role="img"
            aria-label="Hourly error volume over the last 24 hours"
        >
            {series.map((bucket, i) => {
                const barHeight = (bucket.count / maxCount) * height;
                const x = i * (barWidth + barGap);
                const y = height - barHeight;
                const isCurrentHour = i === series.length - 1;
                return (
                    <g key={bucket.hour}>
                        <rect
                            x={x}
                            y={y}
                            width={barWidth}
                            height={Math.max(barHeight, bucket.count > 0 ? 2 : 0)}
                            rx={1.5}
                            fill={isCurrentHour ? 'var(--color-accent)' : 'var(--color-accent-strong)'}
                            opacity={isCurrentHour ? 1 : 0.55}
                        >
                            <title>{`${formatHourLabel(bucket.hour)}: ${bucket.count} error${bucket.count === 1 ? '' : 's'}`}</title>
                        </rect>
                    </g>
                );
            })}
            <text x={0} y={height + 18} className="trend-chart-axis-label">
                {formatHourLabel(series[0].hour)}
            </text>
            <text x={width} y={height + 18} textAnchor="end" className="trend-chart-axis-label">
                now
            </text>
        </svg>
    );
}

function AlertStatusCard({ alerts }) {
    const { totalProjects, projectsConfigured, spikingCount, spikingGroups } = alerts;

    return (
        <>
            <div className="alert-status-summary">
                <span className={`badge ${spikingCount > 0 ? 'badge-trend-spiking' : 'badge-trend-normal'}`}>
                    {spikingCount > 0 ? `⚡ ${spikingCount} spiking now` : 'No active spikes'}
                </span>
                <span className="cell-muted mono" style={{ fontSize: '0.78rem' }}>
                    {projectsConfigured} / {totalProjects} project{totalProjects === 1 ? '' : 's'} alerting
                </span>
            </div>
            {spikingGroups.length > 0 ? (
                <ul className="overview-list">
                    {spikingGroups.map((g) => (
                        <li key={g.groupId}>
                            <Link to={`/groups/${g.groupId}`} className="overview-list-title">
                                {g.message}
                            </Link>
                            <span className="cell-muted" style={{ fontSize: '0.78rem' }}>
                                {g.projectName} · {g.count} events · {formatRelativeTime(g.lastSeen)}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="cell-muted" style={{ fontSize: '0.85rem', marginTop: '0.75rem' }}>
                    Nothing is currently spiking above its 24h baseline.
                </p>
            )}
        </>
    );
}

function ReleaseTimeline({ releases }) {
    if (releases.length === 0) {
        return (
            <p className="cell-muted" style={{ fontSize: '0.85rem' }}>
                No release-tagged errors yet — send an event with a <code>release</code> field to see it here.
            </p>
        );
    }

    return (
        <ul className="overview-list">
            {releases.map((r) => (
                <li key={r.groupId}>
                    <div>
                        <span className="badge badge-release mono">{r.release}</span>{' '}
                        <Link to={`/groups/${r.groupId}`} className="overview-list-title">
                            {r.message}
                        </Link>
                    </div>
                    <span className="cell-muted" style={{ fontSize: '0.78rem' }}>
                        {r.projectName} · introduced {formatRelativeTime(r.firstSeen)}
                    </span>
                </li>
            ))}
        </ul>
    );
}

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

    // Task 36: dashboard overview — trend chart, alert status, release
    // timeline. Fetched separately from `projects` (its own endpoint,
    // its own loading/error state) rather than derived client-side
    // from the project list, since the aggregation (hourly event
    // buckets, isSpiking groups, recent releases) genuinely needs
    // server-side queries across ErrorEvent/ErrorGroup that the
    // dashboard has no other reason to fetch.
    const [overview, setOverview] = useState(null);
    const [overviewLoading, setOverviewLoading] = useState(true);
    const [overviewError, setOverviewError] = useState('');

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

    const fetchOverview = useCallback(async () => {
        setOverviewLoading(true);
        setOverviewError('');
        try {
            const res = await api.get('/projects/overview');
            setOverview(res.data.data);
        } catch (err) {
            setOverviewError(err.response?.data?.error || 'Failed to load dashboard overview.');
        } finally {
            setOverviewLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProjects();
        fetchOverview();
    }, [fetchProjects, fetchOverview]);

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
            {/* Top Fixed Header */}
            <header className="topbar">
                <div className="topbar-brand">
                    <h1 className="brand-logo-text">FAULTLINE</h1>
                    <div className="status-pill-badge">
                        <span className="live-indicator-dot" style={{ background: 'var(--color-accent)' }} />
                        <span>All systems operational</span>
                    </div>
                </div>
                <div className="topbar-meta">
                    <Link to="/dashboard" className="topbar-link active">Dashboard</Link>
                    <Link to="/docs" className="topbar-link">API Docs</Link>
                    <span className="topbar-divider">/</span>
                    <span className="mono topbar-user">{user?.name}</span>
                    <button type="button" className="btn-ghost btn-sm" onClick={logout}>
                        Log out
                    </button>
                </div>
            </header>

            {/* 4 Stat Cards Row */}
            <div className="metrics-overview-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="stat-card">
                    <span className="stat-label">PROJECTS</span>
                    <span className="stat-value">{projects.length}</span>
                    <span className="stat-meta">Active applications</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">GITHUB GROUNDED</span>
                    <span className="stat-value">{reposLinkedCount}</span>
                    <span className="stat-meta">Context enabled</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">SYSTEM STATUS</span>
                    <span className="stat-value text-accent" style={{ fontSize: '1.4rem', color: 'var(--color-accent)' }}>Operational</span>
                    <span className="stat-meta">SSE stream active</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">WORKER QUEUE</span>
                    <span className="stat-value text-accent" style={{ fontSize: '1.4rem', color: 'var(--color-accent)' }}>Ready</span>
                    <span className="stat-meta">BullMQ worker listening</span>
                </div>
            </div>

            {/* Task 36: Overview widgets — trend chart, alert status, release timeline */}
            <div className="overview-widgets-grid" style={{ marginTop: '1.25rem' }}>
                <section className="card overview-card overview-card-wide">
                    <div className="section-header-inline">
                        <h2 className="sub-heading" style={{ fontSize: '0.85rem' }}>ERROR VOLUME — LAST 24H</h2>
                    </div>
                    {overviewLoading && <p className="cell-muted">Loading trend...</p>}
                    {!overviewLoading && overviewError && <p className="alert alert-error" role="alert">{overviewError}</p>}
                    {!overviewLoading && !overviewError && overview && (
                        <TrendChart series={overview.trend.series} />
                    )}
                </section>

                <section className="card overview-card">
                    <div className="section-header-inline">
                        <h2 className="sub-heading" style={{ fontSize: '0.85rem' }}>ALERT STATUS</h2>
                    </div>
                    {overviewLoading && <p className="cell-muted">Loading alerts...</p>}
                    {!overviewLoading && overviewError && <p className="alert alert-error" role="alert">{overviewError}</p>}
                    {!overviewLoading && !overviewError && overview && (
                        <AlertStatusCard alerts={overview.alerts} />
                    )}
                </section>

                <section className="card overview-card">
                    <div className="section-header-inline">
                        <h2 className="sub-heading" style={{ fontSize: '0.85rem' }}>RECENT RELEASES</h2>
                    </div>
                    {overviewLoading && <p className="cell-muted">Loading releases...</p>}
                    {!overviewLoading && overviewError && <p className="alert alert-error" role="alert">{overviewError}</p>}
                    {!overviewLoading && !overviewError && overview && (
                        <ReleaseTimeline releases={overview.releases.recent} />
                    )}
                </section>
            </div>

            {/* Main Content 12-Column Grid */}
            <div className="dashboard-main-grid" style={{ marginTop: '1.75rem' }}>
                {/* Onboard Project Form (Left 4 Cols) */}
                <section className="card card-accented onboard-card">
                    <div className="section-header">
                        <h2>Onboard Project</h2>
                        <p className="section-subtitle">Connect an application to start monitoring runtime errors.</p>
                    </div>
                    <form onSubmit={handleCreate} className="create-project-form-vertical">
                        <div className="field">
                            <label htmlFor="project-name">Project Name</label>
                            <input
                                id="project-name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. auth-service"
                                required
                            />
                        </div>
                        <div className="field">
                            <label htmlFor="project-repo">GitHub Repository <span className="label-opt">(optional)</span></label>
                            <input
                                id="project-repo"
                                type="text"
                                value={githubRepo}
                                onChange={(e) => setGithubRepo(e.target.value)}
                                placeholder="owner/repo"
                            />
                        </div>
                        <button type="submit" className="btn btn-primary btn-full" disabled={creating}>
                            {creating ? 'Creating...' : '+ Create project'}
                        </button>
                    </form>
                    {createError && <p className="alert alert-error" role="alert" style={{ marginTop: '1rem' }}>{createError}</p>}

                    {newApiKey && (
                        <div className="alert alert-info" role="alert" style={{ marginTop: '1.25rem' }}>
                            <p style={{ margin: '0 0 0.5rem 0' }}>
                                <strong>Save this API key now — shown only once:</strong>
                            </p>
                            <code className="api-key-reveal">{newApiKey}</code>
                            <div style={{ marginTop: '1rem' }}>
                                <strong>SDK Onboarding Snippet:</strong>
                                <SdkSnippetGenerator apiKey={newApiKey} projectName={newProjectName} />
                            </div>
                        </div>
                    )}
                </section>

                {/* Your Projects Table (Right 8 Cols) */}
                <section className="projects-table-section">
                    <div className="section-header-inline">
                        <h2 className="sub-heading" style={{ fontSize: '0.85rem' }}>YOUR PROJECTS</h2>
                        <span className="mono-count">{projects.length} total</span>
                    </div>

                    {loading && <p className="cell-muted">Loading projects...</p>}
                    {!loading && loadError && <p className="alert alert-error" role="alert">{loadError}</p>}
                    {!loading && !loadError && projects.length === 0 && (
                        <div className="card empty-state-card">
                            <h3>No projects monitored yet</h3>
                            <p className="cell-muted">
                                Onboard your first project on the left to generate an API key and start monitoring runtime errors.
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
        </div>
    );
}

export default DashboardPage;