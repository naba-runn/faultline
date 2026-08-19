import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
    Activity,
    AlertTriangle,
    Layers,
    Clock,
    Plus,
    FolderKanban,
    ChevronRight,
    ExternalLink,
    Code2,
    CheckCircle2
} from 'lucide-react';
import api from '../api/axios.js';
import AppLayout from '../components/AppLayout.jsx';
import SdkSnippetGenerator from '../components/SdkSnippetGenerator.jsx';
import { formatRelativeTime } from '../utils/formatters.js';
import TrendChart from '../components/dashboard/TrendChart.jsx';
import DashboardMetricsSkeleton from '../components/dashboard/DashboardSkeleton.jsx';
import ProjectsTableSkeleton from '../components/dashboard/ProjectsTableSkeleton.jsx';
import { SEVERITY_LABEL } from '../utils/uiConstants.js';


// 25-point hourly area/bar chart for the trailing 24h trend with subtle teal styling
export default function DashboardPage() {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    const [selectedProjectId, setSelectedProjectId] = useState('all');

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

    // Filter projects, spiking groups, and recent incidents based on selected project
    const filteredProjects = useMemo(() => {
        if (selectedProjectId === 'all') return projects;
        return projects.filter((p) => String(p.id || p._id) === String(selectedProjectId));
    }, [projects, selectedProjectId]);

    const filteredSpikes = useMemo(() => {
        const spikes = overview?.alerts?.spikingGroups || [];
        if (selectedProjectId === 'all') return spikes;
        return spikes.filter((s) => String(s.projectId) === String(selectedProjectId));
    }, [overview, selectedProjectId]);

    const filteredIncidents = useMemo(() => {
        const incidents = overview?.releases?.recent || [];
        if (selectedProjectId === 'all') return incidents;
        return incidents.filter((i) => String(i.projectId) === String(selectedProjectId));
    }, [overview, selectedProjectId]);

    // Metrics computation
    const totalEvents24h = overview?.trend?.series
        ? overview.trend.series.reduce((sum, b) => sum + b.count, 0)
        : 0;
    const spikingCount = filteredSpikes.length;
    const unresolvedCount = overview?.unresolvedCount ?? 0;
    const lastEventTime = overview?.lastEventAt
        ? formatRelativeTime(overview.lastEventAt)
        : 'None';

    return (
        <AppLayout>
            {/* Page Header */}
            <div className="dash-header-bar">
                <div className="dash-header-info">
                    <h1>Faultline</h1>
                    <p className="dash-header-desc">Runtime errors across your applications</p>
                </div>

                <div className="dash-header-actions">
                    <div className="system-status-badge">
                        <span className="system-status-dot" aria-hidden="true" />
                        <span>All systems operational</span>
                    </div>

                    <div className="project-filter-control">
                        <select
                            id="project-filter"
                            className="project-filter-select"
                            value={selectedProjectId}
                            onChange={(e) => setSelectedProjectId(e.target.value)}
                            aria-label="Filter dashboard by project"
                        >
                            <option value="all">All projects ({projects.length})</option>
                            {projects.map((p) => (
                                <option key={p.id || p._id} value={p.id || p._id}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Metric Panels Grid */}
            {overviewLoading && !overview ? (
                <DashboardMetricsSkeleton />
            ) : (
                <div className="metrics-grid">
                    <div className="metric-panel">
                        <div className="metric-panel-header">
                            <span className="metric-panel-label">Projects</span>
                        </div>
                        <div className="metric-panel-value">{filteredProjects.length}</div>
                        <div className="metric-panel-sub">monitored</div>
                    </div>

                    <div className="metric-panel">
                        <div className="metric-panel-header">
                            <span className="metric-panel-label">Events (24h)</span>
                        </div>
                        <div className="metric-panel-value">{totalEvents24h}</div>
                        <div className="metric-panel-sub">trailing volume</div>
                    </div>

                    <div className={`metric-panel ${spikingCount > 0 ? 'metric-panel-warning' : ''}`}>
                        <div className="metric-panel-header">
                            <span className="metric-panel-label">Spiking</span>
                        </div>
                        <div className="metric-panel-value">{spikingCount}</div>
                        <div className="metric-panel-sub">{spikingCount === 1 ? 'active alert' : 'active alerts'}</div>
                    </div>

                    <div className={`metric-panel ${unresolvedCount > 0 ? 'metric-panel-danger' : ''}`}>
                        <div className="metric-panel-header">
                            <span className="metric-panel-label">Unresolved</span>
                        </div>
                        <div className="metric-panel-value">{unresolvedCount}</div>
                        <div className="metric-panel-sub">open error groups</div>
                    </div>

                    <div className="metric-panel">
                        <div className="metric-panel-header">
                            <span className="metric-panel-label">Last Event</span>
                        </div>
                        <div className="metric-panel-value" style={{ fontSize: '1.25rem' }}>{lastEventTime}</div>
                        <div className="metric-panel-sub">latest telemetry</div>
                    </div>
                </div>
            )}

            {/* Error Volume Section (Open visualization area) */}
            <section className="dash-section">
                <div className="dash-section-header">
                    <h2 className="dash-section-title">Error volume</h2>
                    <span className="dash-section-meta">Trailing 24 hours</span>
                </div>
                {overviewLoading && !overview ? (
                    <div className="skeleton" style={{ width: '100%', height: '70px', borderRadius: 'var(--radius-md)' }} />
                ) : (
                    <TrendChart series={overview?.trend?.series || []} />
                )}
            </section>

            {/* Recent Spikes Section (Unboxed List with Hairline Dividers) */}
            {filteredSpikes.length > 0 && (
                <section className="dash-section">
                    <div className="dash-section-header">
                        <h2 className="dash-section-title">
                            Recent Spikes <span className="dash-section-meta">{filteredSpikes.length}</span>
                        </h2>
                    </div>
                    <div className="spikes-list">
                        {filteredSpikes.map((spike) => (
                            <Link
                                key={spike.groupId}
                                to={`/groups/${spike.groupId}`}
                                className="spike-row"
                            >
                                <div className="spike-left">
                                    <span className="spike-tag">Spike</span>
                                    <span className="spike-title">{spike.message}</span>
                                </div>
                                <span className="spike-meta">
                                    {spike.projectName ? `${spike.projectName} · ` : ''}
                                    {spike.count} events · {formatRelativeTime(spike.lastSeen)}
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/* Recent Incidents Section (Structured Observability Table) */}
            <section className="dash-section">
                <div className="dash-section-header">
                    <h2 className="dash-section-title">
                        Recent Incidents <span className="dash-section-meta">{filteredIncidents.length}</span>
                    </h2>
                </div>

                {filteredIncidents.length === 0 ? (
                    <div className="empty-state-compact">
                        <span className="empty-state-compact-title">No recent incidents</span>
                        <span className="empty-state-compact-desc">No tagged incidents reported in the recent release window.</span>
                    </div>
                ) : (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th style={{ width: '85px' }}>Severity</th>
                                    <th>Issue</th>
                                    <th style={{ width: '160px' }}>Project</th>
                                    <th style={{ width: '120px' }}>Release</th>
                                    <th style={{ width: '75px', textAlign: 'right' }}>Events</th>
                                    <th style={{ width: '100px' }}>Last Seen</th>
                                    <th style={{ width: '90px' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredIncidents.map((incident) => {
                                    const sev = incident.severity || 'medium';
                                    return (
                                        <tr key={incident.groupId} className={`row-hoverable row-${sev}`}>
                                            <td>
                                                <span className={`badge badge-severity-${sev}`}>
                                                    {SEVERITY_LABEL[sev] || sev}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="issue-cell">
                                                    <Link to={`/groups/${incident.groupId}`} className="issue-title-link">
                                                        {incident.message}
                                                    </Link>
                                                </div>
                                            </td>
                                            <td>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                    {incident.projectName || '—'}
                                                </span>
                                            </td>
                                            <td>
                                                {incident.release ? (
                                                    <span className="badge-release">{incident.release}</span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                                                {incident.count}
                                            </td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                                {formatRelativeTime(incident.lastSeen)}
                                            </td>
                                            <td>
                                                <span className={`badge badge-status-${incident.status || 'open'}`}>
                                                    {incident.status || 'open'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Monitored Projects Section */}
            <section className="dash-section" id="projects">
                <div className="dash-section-header">
                    <h2 className="dash-section-title">
                        Projects <span className="dash-section-meta">{filteredProjects.length} total</span>
                    </h2>
                </div>

                {loading ? (
                    <ProjectsTableSkeleton count={3} />
                ) : filteredProjects.length === 0 ? (
                    <div className="empty-state-card">
                        <div className="empty-state-icon-wrap">
                            <FolderKanban size={22} />
                        </div>
                        <h3 className="empty-state-title">No projects monitored</h3>
                        <p className="empty-state-desc">
                            Create your first project below to receive an API key and start ingesting errors.
                        </p>
                    </div>
                ) : (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Project</th>
                                    <th>Repository</th>
                                    <th>Created</th>
                                    <th>Integration</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProjects.map((p) => (
                                    <tr key={p.id || p._id} className="row-hoverable">
                                        <td>
                                            <Link
                                                to={`/projects/${p.id || p._id}`}
                                                style={{ fontWeight: 600, color: 'var(--text-primary)' }}
                                            >
                                                {p.name}
                                            </Link>
                                        </td>
                                        <td>
                                            {(p.githubRepo || p.repo) ? (
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                                                    {p.githubRepo || p.repo}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                                            )}
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                                            {new Date(p.createdAt).toLocaleDateString(undefined, {
                                                day: 'numeric',
                                                month: 'short',
                                                year: 'numeric',
                                            })}
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => {
                                                    setSelectedSnippetProjectId(
                                                        selectedSnippetProjectId === (p.id || p._id)
                                                            ? null
                                                            : (p.id || p._id)
                                                    );
                                                }}
                                            >
                                                <Code2 size={13} />
                                                Setup
                                            </button>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <Link
                                                to={`/projects/${p.id || p._id}`}
                                                className="btn btn-secondary btn-sm"
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

                {/* Sdk Snippet Drawer if triggered */}
                {selectedSnippetProjectId && (
                    <div style={{ marginTop: '1.25rem' }}>
                        <SdkSnippetGenerator
                            projectId={selectedSnippetProjectId}
                            projectName={projects.find((p) => (p.id || p._id) === selectedSnippetProjectId)?.name}
                            onClose={() => setSelectedSnippetProjectId(null)}
                        />
                    </div>
                )}
            </section>

            {/* Onboard a Project Form (Refined Secondary Surface) */}
            <section className="dash-section" id="onboard">
                <div className="dash-section-header">
                    <h2 className="dash-section-title">Onboard a project</h2>
                </div>

                <div className="chart-surface" style={{ padding: '1.25rem 1.5rem' }}>
                    <form onSubmit={handleCreate} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div className="form-group" style={{ flex: '1 1 200px' }}>
                            <label htmlFor="project-name">Project name</label>
                            <input
                                id="project-name"
                                type="text"
                                placeholder="e.g. auth-service"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>

                        <div className="form-group" style={{ flex: '1 1 240px' }}>
                            <label htmlFor="github-repo">
                                GitHub repo <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
                            </label>
                            <input
                                id="github-repo"
                                type="text"
                                placeholder="owner/repo"
                                value={githubRepo}
                                onChange={(e) => setGithubRepo(e.target.value)}
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={creating || !name.trim()}
                            style={{ height: '34px' }}
                        >
                            <Plus size={15} />
                            {creating ? 'Creating…' : 'Create project'}
                        </button>
                    </form>

                    {createError && (
                        <p style={{ color: 'var(--critical)', fontSize: '0.78rem', marginTop: '0.75rem' }}>
                            {createError}
                        </p>
                    )}

                    {/* New Project API Key Banner */}
                    {newApiKey && (
                        <div style={{ marginTop: '1.25rem' }}>
                            <SdkSnippetGenerator
                                projectId={projects[0]?.id || projects[0]?._id}
                                apiKey={newApiKey}
                                projectName={newProjectName}
                                onClose={() => setNewApiKey(null)}
                            />
                        </div>
                    )}
                </div>
            </section>
        </AppLayout>
    );
}