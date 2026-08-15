import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/axios.js';
import SdkSnippetGenerator from '../components/SdkSnippetGenerator.jsx';

const SEVERITY_LABEL = {
    low: 'LOW',
    medium: 'MEDIUM',
    high: 'HIGH',
    critical: 'CRITICAL',
};

const SEVERITY_COLOR = {
    critical: 'var(--color-danger)',
    high: 'var(--color-warning)',
    medium: 'var(--color-caution)',
    low: 'var(--color-text-muted)',
};

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
    const totalCount = series.reduce((sum, b) => sum + b.count, 0);
    const maxCount = Math.max(1, ...series.map((b) => b.count));
    const width = 700;
    const height = 50;
    const barGap = 3;
    const barWidth = (width - barGap * (series.length - 1)) / series.length;

    return (
        <div style={{ position: 'relative', marginTop: '0.35rem' }}>
            <svg
                viewBox={`0 0 ${width} ${height + 20}`}
                className="trend-chart-svg"
                role="img"
                aria-label="Hourly error volume over the last 24 hours"
            >
                {/* Horizontal baseline */}
                <line
                    x1="0"
                    y1={height}
                    x2={width}
                    y2={height}
                    stroke="var(--color-border-strong)"
                    strokeWidth="1"
                />

                {series.map((bucket, i) => {
                    const hasCount = bucket.count > 0;
                    const barHeight = hasCount ? Math.max(4, (bucket.count / maxCount) * height) : 2;
                    const x = i * (barWidth + barGap);
                    const y = height - barHeight;
                    const isCurrentHour = i === series.length - 1;

                    return (
                        <g key={bucket.hour}>
                            <rect
                                x={x}
                                y={y}
                                width={barWidth}
                                height={barHeight}
                                rx={1}
                                fill={hasCount ? (isCurrentHour ? 'var(--color-accent)' : 'var(--color-accent-strong)') : 'var(--color-border-strong)'}
                                opacity={hasCount ? (isCurrentHour ? 1 : 0.7) : 0.3}
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
            {totalCount === 0 && (
                <div style={{
                    position: 'absolute',
                    top: '30%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontSize: '0.75rem',
                    color: 'var(--color-text-faint)',
                    pointerEvents: 'none',
                }}>
                    No error activity in trailing 24h
                </div>
            )}
        </div>
    );
}

function DashboardMetricsSkeleton() {
    return (
        <div className="metrics-row" aria-busy="true" aria-label="Loading metrics">
            <div className="metric-item">
                <span className="skeleton" style={{ width: '28px', height: '24px' }} />
                <span className="skeleton" style={{ width: '48px', height: '12px' }} />
            </div>
            <div className="metric-item">
                <span className="skeleton" style={{ width: '36px', height: '24px' }} />
                <span className="skeleton" style={{ width: '68px', height: '12px' }} />
            </div>
            <div className="metric-item">
                <span className="skeleton" style={{ width: '24px', height: '24px' }} />
                <span className="skeleton" style={{ width: '56px', height: '12px' }} />
            </div>
            <div className="metric-item">
                <span className="skeleton" style={{ width: '48px', height: '18px' }} />
                <span className="skeleton" style={{ width: '54px', height: '12px' }} />
            </div>
        </div>
    );
}

function TrendChartSkeleton() {
    const width = 700;
    const height = 50;
    const count = 25;
    const barGap = 3;
    const barWidth = (width - barGap * (count - 1)) / count;

    return (
        <div style={{ position: 'relative', marginTop: '0.35rem' }} aria-busy="true" aria-label="Loading error volume chart">
            <svg
                viewBox={`0 0 ${width} ${height + 20}`}
                className="trend-chart-svg"
                role="img"
            >
                <line
                    x1="0"
                    y1={height}
                    x2={width}
                    y2={height}
                    stroke="var(--color-border-strong)"
                    strokeWidth="1"
                />
                {Array.from({ length: count }).map((_, i) => {
                    const barHeight = 4 + ((i * 7 + 3) % 24);
                    const x = i * (barWidth + barGap);
                    const y = height - barHeight;
                    return (
                        <rect
                            key={i}
                            x={x}
                            y={y}
                            width={barWidth}
                            height={barHeight}
                            rx={1}
                            fill="var(--color-surface-container)"
                            opacity={0.5}
                        />
                    );
                })}
                <text x={0} y={height + 16} className="trend-chart-axis-label" fill="var(--color-text-faint)">
                    24h ago
                </text>
                <text x={width} y={height + 16} textAnchor="end" className="trend-chart-axis-label" fill="var(--color-text-faint)">
                    now
                </text>
            </svg>
        </div>
    );
}

function IncidentListSkeleton({ count = 3 }) {
    return (
        <div className="incident-list" aria-busy="true" aria-label="Loading incidents">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="incident-row" style={{ pointerEvents: 'none' }}>
                    <div className="incident-severity">
                        <span className="skeleton" style={{ width: '48px', height: '14px' }} />
                    </div>
                    <div className="incident-content">
                        <div className="incident-header-line">
                            <span className="skeleton" style={{ width: `${55 + (i * 12) % 30}%`, height: '14px' }} />
                            <span className="skeleton" style={{ width: '38px', height: '12px' }} />
                        </div>
                        <div className="incident-meta" style={{ marginTop: '0.25rem' }}>
                            <span className="skeleton" style={{ width: `${35 + (i * 8) % 25}%`, height: '11px' }} />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function ProjectsTableSkeleton({ count = 3 }) {
    return (
        <div className="table-wrap" aria-busy="true" aria-label="Loading projects">
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
                    {Array.from({ length: count }).map((_, i) => (
                        <tr key={i}>
                            <td>
                                <span className="skeleton" style={{ width: `${90 + (i * 20) % 40}px`, height: '14px' }} />
                            </td>
                            <td>
                                <span className="skeleton" style={{ width: '110px', height: '12px' }} />
                            </td>
                            <td>
                                <span className="skeleton" style={{ width: '70px', height: '12px' }} />
                            </td>
                            <td>
                                <span className="skeleton" style={{ width: '42px', height: '20px' }} />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                                <span className="skeleton" style={{ width: '80px', height: '22px' }} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
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
    const lastEventTime = overview?.lastEventAt
        ? formatRelativeTime(overview.lastEventAt)
        : null;
    const unresolvedCount = overview?.unresolvedCount ?? null;

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
            {overviewLoading && !overview ? (
                <DashboardMetricsSkeleton />
            ) : overview ? (
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
                    {unresolvedCount !== null && (
                        <div className="metric-item">
                            <span className="metric-value" style={{ color: 'var(--color-warning)' }}>{unresolvedCount}</span>
                            <span className="metric-label">unresolved</span>
                        </div>
                    )}
                    {lastEventTime && (
                        <div className="metric-item">
                            <span className="metric-value" style={{ fontSize: '1rem' }}>{lastEventTime}</span>
                            <span className="metric-label">last event</span>
                        </div>
                    )}
                </div>
            ) : null}

            {/* Trend Chart — directly in the flow */}
            {overviewLoading && !overview ? (
                <div className="overview-section">
                    <hr className="section-divider" />
                    <div className="sub-heading">Error Volume — Last 24h</div>
                    <TrendChartSkeleton />
                </div>
            ) : overview ? (
                <div className="overview-section">
                    <hr className="section-divider" />
                    <div className="sub-heading">Error Volume — Last 24h</div>
                    <TrendChart series={overview.trend.series} />
                </div>
            ) : null}
            {!overviewLoading && overviewError && <p className="alert alert-error" role="alert">{overviewError}</p>}

            {/* Spiking Incidents */}
            {!overviewLoading && !overviewError && overview && spikingGroups.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                    <hr className="section-divider" />
                    <div className="section-header-inline">
                        <h2 style={{ fontSize: '0.85rem' }}>Recent Spikes</h2>
                        <span className="mono-count">{spikingGroups.length}</span>
                    </div>
                    <div className="incident-list incident-list-scroll">
                        {spikingGroups.map((g) => (
                            <div key={g.groupId} className="incident-row">
                                <div className="incident-severity severity-marker severity-marker-high">
                                    SPIKE
                                </div>
                                <div className="incident-content">
                                    <div className="incident-header-line">
                                        <Link to={`/groups/${g.groupId}`} className="incident-message">
                                            {g.message}
                                        </Link>
                                    </div>
                                    <div className="incident-meta">
                                        {g.projectName} · <span className="mono" style={{ fontSize: '0.72rem' }}>{g.count}</span> events · {formatRelativeTime(g.lastSeen)}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent Incidents */}
            {overviewLoading && !overview ? (
                <div style={{ marginTop: '0.25rem' }}>
                    <hr className="section-divider" />
                    <div className="section-header-inline">
                        <h2 style={{ fontSize: '0.85rem' }}>Recent Incidents</h2>
                        <span className="skeleton" style={{ width: '24px', height: '14px' }} />
                    </div>
                    <IncidentListSkeleton count={3} />
                </div>
            ) : overview && overview.releases.recent.length > 0 ? (
                <div style={{ marginTop: '0.25rem' }}>
                    <hr className="section-divider" />
                    <div className="section-header-inline">
                        <h2 style={{ fontSize: '0.85rem' }}>Recent Incidents</h2>
                        <span className="mono-count">{overview.releases.recent.length}</span>
                    </div>
                    <div className="incident-list incident-list-scroll">
                        {overview.releases.recent.map((r) => {
                            const sevKey = r.severity?.toLowerCase();
                            const sevColor = SEVERITY_COLOR[sevKey] || 'var(--color-text-faint)';
                            const sevLabel = SEVERITY_LABEL[sevKey] || '—';
                            const statusKey = r.status || 'open';
                            return (
                                <div key={r.groupId} className="incident-row">
                                    <div
                                        className="incident-severity"
                                        style={{ color: sevColor }}
                                    >
                                        {sevLabel}
                                    </div>
                                    <div className="incident-content">
                                        <div className="incident-header-line">
                                            <Link to={`/groups/${r.groupId}`} className="incident-message">
                                                {r.message}
                                            </Link>
                                            <span className={`incident-status incident-status-${statusKey}`}>
                                                {statusKey.toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="incident-meta">
                                            {r.projectName}
                                            {r.release && <>{' · '}<span className="mono" style={{ fontSize: '0.72rem' }}>{r.release}</span></>}
                                            {' · '}<span className="mono" style={{ fontSize: '0.72rem' }}>{r.count}</span> events
                                            {' · '}{formatRelativeTime(r.lastSeen || r.firstSeen)}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            {/* Projects */}
            <div className="project-table-section">
                <hr className="section-divider" />
                <div className="section-header-inline">
                    <h2 style={{ fontSize: '0.85rem' }}>Projects</h2>
                    {loading && projects.length === 0 ? (
                        <span className="skeleton" style={{ width: '45px', height: '14px' }} />
                    ) : (
                        <span className="mono-count">{projects.length} total</span>
                    )}
                </div>

                {loading && projects.length === 0 && <ProjectsTableSkeleton count={3} />}
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
                                                {selectedSnippetProjectId === project.id ? 'Hide' : 'Setup'}
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
                    <div className="setup-guide" style={{ marginTop: '1.25rem' }}>
                        <div className="setup-guide-header">
                            <h3 className="setup-guide-title">Project Created: {newProjectName}</h3>
                            <p className="setup-guide-desc">
                                Save your ingestion API key and configure your application to report runtime errors.
                            </p>
                        </div>

                        <div className="setup-steps">
                            <div className="setup-step">
                                <div className="setup-step-heading">
                                    <span className="setup-step-num">01</span>
                                    <h4 className="setup-step-title">Save your Ingestion API Key (Shown Once)</h4>
                                </div>
                                <p className="setup-step-body">
                                    This raw key will <strong>not be displayed again</strong>. Store it as an environment variable (<code>FAULTLINE_API_KEY</code>) on your server. Never commit it to source control or expose it in client-side code.
                                </p>
                                <code className="api-key-reveal">{newApiKey}</code>
                                {githubRepo && (
                                    <div className="setup-notice">
                                        <strong>GitHub Context:</strong> <code>{githubRepo}</code> is linked for AI source analysis. It does <em>not</em> auto-instrument your application.
                                    </div>
                                )}
                            </div>

                            <div className="setup-step">
                                <div className="setup-step-heading">
                                    <span className="setup-step-num">02</span>
                                    <h4 className="setup-step-title">Add Error Reporting to Your Application</h4>
                                </div>
                                <p className="setup-step-body">
                                    Send runtime exceptions via authenticated HTTP to Faultline.
                                </p>
                                <SdkSnippetGenerator projectName={newProjectName} />
                            </div>

                            <div className="setup-step">
                                <div className="setup-step-heading">
                                    <span className="setup-step-num">03</span>
                                    <h4 className="setup-step-title">Next Steps</h4>
                                </div>
                                <p className="setup-step-body">
                                    1. Save <code>FAULTLINE_API_KEY</code> in your application environment.<br />
                                    2. Add error reporting to your server error handler.<br />
                                    3. Trigger or send a test error.<br />
                                    4. Return to your project dashboard to verify that events appear.
                                </p>
                                <div style={{ marginTop: '0.4rem' }}>
                                    <Link to="/docs" className="topbar-link" style={{ fontSize: '0.78rem', textDecoration: 'underline' }}>
                                        View complete API reference →
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default DashboardPage;