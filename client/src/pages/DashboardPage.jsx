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

// 25-point hourly bar chart for the trailing 24h trend.
function TrendChart({ series }) {
    const maxCount = Math.max(1, ...series.map((b) => b.count));
    const width = 700;
    const height = 120;
    const barGap = 2;
    const barWidth = (width - barGap * (series.length - 1)) / series.length;

    return (
        <svg
            viewBox={`0 0 ${width} ${height + 20}`}
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
                            opacity={isCurrentHour ? 1 : 0.4}
                        >
                            <title>{`${formatHourLabel(bucket.hour)}: ${bucket.count} error${bucket.count === 1 ? '' : 's'}`}</title>
                        </rect>
                    </g>
                );
            })}
            <text x={0} y={height + 16} className="trend-chart-axis-label">
                {formatHourLabel(series[0].hour)}
            </text>
            <text x={width} y={height + 16} textAnchor="end" className="trend-chart-axis-label">
                now
            </text>
        </svg>
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

    // Compute aggregate metrics from overview data
    const totalGroups = overview?.trend?.series
        ? overview.trend.series.reduce((sum, b) => sum + b.count, 0)
        : null;
    const spikingCount = overview?.alerts?.spikingCount || 0;
    const spikingGroups = overview?.alerts?.spikingGroups || [];
    const lastEventTime = overview?.trend?.series
        ? (() => {
            // Find the most recent non-zero bucket
            for (let i = overview.trend.series.length - 1; i >= 0; i--) {
                if (overview.trend.series[i].count > 0) {
                    return formatRelativeTime(overview.trend.series[i].hour);
                }
            }
            return '—';
        })()
        : null;

    return (
        <div className="page">
            {/* Topbar */}
            <header className="topbar">
                <div className="topbar-left">
                    <div className="topbar-brand">
                        <h1 className="brand-logo-text">FAULTLINE</h1>
                    </div>
                    <nav className="topbar-nav">
                        <Link to="/dashboard" className="topbar-link active">Dashboard</Link>
                        <Link to="/docs" className="topbar-link">API Docs</Link>
                    </nav>
                </div>
                <div className="topbar-meta">
                    <span className="topbar-user">{user?.name}</span>
                    <button type="button" className="btn-ghost btn-sm" onClick={logout}>
                        Log out
                    </button>
                </div>
            </header>

            {/* Page Header */}
            <div className="dash-header">
                <h1>Faultline</h1>
                <div className="dash-header-sub">
                    <span>Runtime errors across your applications</span>
                    <span className="dash-status">
                        <span className="dash-status-dot" />
                        Operational
                    </span>
                </div>
            </div>

            {/* Inline Metrics */}
            {!overviewLoading && !overviewError && overview && (
                <div className="metrics-row">
                    <div className="metric-item">
                        <span className="metric-value">{projects.length}</span>
                        <span className="metric-label">projects</span>
                    </div>
                    {totalGroups !== null && (
                        <div className="metric-item">
                            <span className="metric-value">{totalGroups}</span>
                            <span className="metric-label">events (24h)</span>
                        </div>
                    )}
                    {spikingCount > 0 && (
                        <div className="metric-item">
                            <span className="metric-value" style={{ color: 'var(--color-danger)' }}>{spikingCount}</span>
                            <span className="metric-label">spiking</span>
                        </div>
                    )}
                    {lastEventTime && (
                        <div className="metric-item">
                            <span className="metric-value" style={{ fontSize: '1rem' }}>{lastEventTime}</span>
                            <span className="metric-label">last event</span>
                        </div>
                    )}
                </div>
            )}

            {/* Trend Chart — directly in the flow */}
            {!overviewLoading && !overviewError && overview && (
                <div className="overview-section">
                    <hr className="section-divider" />
                    <div className="sub-heading">Error Volume — Last 24h</div>
                    <TrendChart series={overview.trend.series} />
                </div>
            )}
            {overviewLoading && <p className="cell-muted" style={{ fontSize: '0.82rem' }}>Loading overview…</p>}
            {!overviewLoading && overviewError && <p className="alert alert-error" role="alert">{overviewError}</p>}

            {/* Spiking Incidents */}
            {!overviewLoading && !overviewError && overview && spikingGroups.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                    <hr className="section-divider" />
                    <div className="section-header-inline">
                        <h2 style={{ fontSize: '0.85rem' }}>Active Spikes</h2>
                        <span className="mono-count">{spikingGroups.length} spiking</span>
                    </div>
                    <div className="incident-list">
                        {spikingGroups.map((g) => (
                            <div key={g.groupId} className="incident-row">
                                <div className="incident-severity severity-marker severity-marker-high">
                                    SPIKE
                                </div>
                                <div className="incident-content">
                                    <Link to={`/groups/${g.groupId}`} className="incident-message">
                                        {g.message}
                                    </Link>
                                    <div className="incident-meta">
                                        {g.projectName} · <span className="mono">{g.count}</span> events · {formatRelativeTime(g.lastSeen)}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent Releases */}
            {!overviewLoading && !overviewError && overview && overview.releases.recent.length > 0 && (
                <div style={{ marginTop: '0.25rem' }}>
                    <hr className="section-divider" />
                    <div className="section-header-inline">
                        <h2 style={{ fontSize: '0.85rem' }}>Recent Releases</h2>
                    </div>
                    <ul className="overview-list">
                        {overview.releases.recent.map((r) => (
                            <li key={r.groupId}>
                                <div>
                                    <span className="badge badge-release mono">{r.release}</span>{' '}
                                    <Link to={`/groups/${r.groupId}`} className="overview-list-title">
                                        {r.message}
                                    </Link>
                                </div>
                                <span className="cell-muted" style={{ fontSize: '0.75rem' }}>
                                    {r.projectName} · introduced {formatRelativeTime(r.firstSeen)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Projects */}
            <div className="project-table-section">
                <hr className="section-divider" />
                <div className="section-header-inline">
                    <h2 style={{ fontSize: '0.85rem' }}>Projects</h2>
                    <span className="mono-count">{projects.length} total</span>
                </div>

                {loading && <p className="cell-muted" style={{ fontSize: '0.82rem' }}>Loading projects…</p>}
                {!loading && loadError && <p className="alert alert-error" role="alert">{loadError}</p>}
                {!loading && !loadError && projects.length === 0 && (
                    <div className="empty-state">
                        <svg className="empty-state-trace" width="64" height="20" viewBox="0 0 64 20" aria-hidden="true">
                            <path d="M0 10 H64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1 5" strokeLinecap="round" />
                        </svg>
                        <h3>No projects monitored yet</h3>
                        <p className="cell-muted" style={{ fontSize: '0.82rem' }}>
                            Create your first project below to generate an API key.
                        </p>
                    </div>
                )}
                {!loading && !loadError && projects.length > 0 && (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Project</th>
                                    <th>Repository</th>
                                    <th>Created</th>
                                    <th>Integration</th>
                                    <th style={{ textAlign: 'right' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {projects.map((project) => (
                                    <tr key={project.id} className="row-hoverable">
                                        <td>
                                            <Link to={`/projects/${project.id}`} className="project-title-link">
                                                {project.name}
                                            </Link>
                                        </td>
                                        <td>
                                            {project.githubRepo ? (
                                                <span className="badge-repo">{project.githubRepo}</span>
                                            ) : (
                                                <span className="cell-muted" style={{ fontSize: '0.75rem' }}>—</span>
                                            )}
                                        </td>
                                        <td className="cell-muted" style={{ fontSize: '0.75rem' }}>
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
                                                {selectedSnippetProjectId === project.id ? 'Hide' : 'SDK'}
                                            </button>
                                            {selectedSnippetProjectId === project.id && (
                                                <div style={{ marginTop: '0.5rem' }}>
                                                    <SdkSnippetGenerator projectName={project.name} />
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <Link
                                                to={`/projects/${project.id}`}
                                                className="btn-secondary"
                                            >
                                                View errors →
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Onboard Project */}
            <div className="onboard-section">
                <hr className="section-divider" />
                <div className="section-header-inline">
                    <h2 style={{ fontSize: '0.85rem' }}>Onboard a project</h2>
                </div>
                <form onSubmit={handleCreate} className="onboard-form">
                    <div className="field">
                        <label htmlFor="project-name">Project name</label>
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
                        <label htmlFor="project-repo">GitHub repo <span className="label-opt">(optional)</span></label>
                        <input
                            id="project-repo"
                            type="text"
                            value={githubRepo}
                            onChange={(e) => setGithubRepo(e.target.value)}
                            placeholder="owner/repo"
                        />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={creating}>
                        {creating ? 'Creating…' : 'Create project'}
                    </button>
                </form>
                {createError && <p className="alert alert-error" role="alert" style={{ marginTop: '0.75rem' }}>{createError}</p>}

                {newApiKey && (
                    <div className="alert alert-info" role="alert" style={{ marginTop: '1rem' }}>
                        <p style={{ margin: '0 0 0.4rem 0' }}>
                            <strong>Save this API key now — shown only once:</strong>
                        </p>
                        <code className="api-key-reveal">{newApiKey}</code>
                        <div style={{ marginTop: '0.75rem' }}>
                            <strong style={{ fontSize: '0.82rem' }}>SDK Onboarding:</strong>
                            <SdkSnippetGenerator apiKey={newApiKey} projectName={newProjectName} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default DashboardPage;