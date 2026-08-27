import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft,
    Search,
    Code2,
    Terminal,
    CheckCircle2,
    GitBranch,
    Bookmark,
    Trash2,
    Filter,
    FileCode
} from 'lucide-react';
import api from '../api/axios.js';
import { useProjectSSE } from '../hooks/useProjectSSE.js';
import AppLayout from '../components/AppLayout.jsx';
import SdkSnippetGenerator from '../components/SdkSnippetGenerator.jsx';
import { formatRelativeTime } from '../utils/formatters.js';
import { SEVERITY_LABEL, STATUS_OPTIONS } from '../utils/uiConstants.js';
import ErrorGroupsTableSkeleton from '../components/project-detail/ErrorGroupsTableSkeleton.jsx';
import SourceMapManager from '../components/project-detail/SourceMapManager.jsx';

const PRESETS = [
    { id: 'all', label: 'All', status: 'all', severity: 'all', search: '' },
    { id: 'open', label: 'Open', status: 'open', severity: 'all', search: '' },
    { id: 'unresolved_high', label: 'High/Critical', status: 'open', severity: 'high', search: '' },
    { id: 'resolved', label: 'Resolved', status: 'resolved', severity: 'all', search: '' },
    { id: 'ignored', label: 'Ignored', status: 'ignored', severity: 'all', search: '' },
];


export default function ProjectDetailPage() {
    const { id } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();

    const [project, setProject] = useState(null);
    const [groups, setGroups] = useState([]);
    const [incidents, setIncidents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [statusError, setStatusError] = useState('');
    const [updatingGroupId, setUpdatingGroupId] = useState(null);

    const [simulating, setSimulating] = useState(false);
    const [simulateResult, setSimulateResult] = useState(null);
    const [simulateError, setSimulateErrorMsg] = useState('');

    const [showSdkSnippet, setShowSdkSnippet] = useState(false);
    const [showSourceMaps, setShowSourceMaps] = useState(false);

    const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
    const [severityFilter, setSeverityFilter] = useState(searchParams.get('severity') || 'all');
    const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');

    const storageKey = `faultline_saved_views_${id}`;
    const [savedViews, setSavedViews] = useState(() => {
        try {
            const raw = localStorage.getItem(storageKey);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });

    const updateUrlParams = (newStatus, newSeverity, newSearch) => {
        const params = {};
        if (newStatus && newStatus !== 'all') params.status = newStatus;
        if (newSeverity && newSeverity !== 'all') params.severity = newSeverity;
        if (newSearch && newSearch.trim()) params.search = newSearch.trim();
        setSearchParams(params, { replace: true });
    };

    const applyFilters = (status, severity, search) => {
        setStatusFilter(status);
        setSeverityFilter(severity);
        setSearchQuery(search);
        updateUrlParams(status, severity, search);
    };

    const handleSaveCustomView = () => {
        const name = prompt('Enter a name for this custom saved view:');
        if (!name || !name.trim()) return;
        const newView = {
            id: 'custom_' + Date.now(),
            name: name.trim(),
            status: statusFilter,
            severity: severityFilter,
            search: searchQuery,
        };
        const updated = [...savedViews, newView];
        setSavedViews(updated);
        try {
            localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch (err) {
            console.error('Failed to save custom view', err);
        }
    };

    const handleDeleteCustomView = (viewId, e) => {
        e.stopPropagation();
        const updated = savedViews.filter((v) => v.id !== viewId);
        setSavedViews(updated);
        try {
            localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch (err) {
            console.error('Failed to update saved views', err);
        }
    };

    const projectLoadedRef = useRef(false);

    const [nextCursor, setNextCursor] = useState(null);
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
        projectLoadedRef.current = false;
    }, [id]);

    const fetchData = useCallback(async (silent = false) => {
        if (!projectLoadedRef.current && !silent) {
            setLoading(true);
        }
        setError('');
        try {
            const [projectRes, groupsRes, incidentsRes] = await Promise.all([
                api.get(`/projects/${id}`),
                api.get(`/projects/${id}/groups`, {
                    params: {
                        status: statusFilter,
                        severity: severityFilter,
                        search: searchQuery,
                        limit: 100,
                    },
                }),
                // Task 41.5: fetched alongside project/groups so the
                // same SSE-triggered silent refetch (below) that keeps
                // the group table live also keeps this list live —
                // one refetch path, not a second parallel one.
                api.get(`/projects/${id}/incidents`),
            ]);
            const fetchedProject = projectRes.data?.data?.project || projectRes.data?.project || projectRes.data?.data;
            const fetchedGroups = groupsRes.data?.data?.groups || groupsRes.data?.groups || (Array.isArray(groupsRes.data?.data) ? groupsRes.data.data : []);
            const fetchedIncidents = incidentsRes.data?.data?.incidents || [];
            setProject(fetchedProject || null);
            setGroups(Array.isArray(fetchedGroups) ? fetchedGroups : []);
            setIncidents(Array.isArray(fetchedIncidents) ? fetchedIncidents : []);
            setNextCursor(groupsRes.data?.data?.nextCursor || null);
            projectLoadedRef.current = true;
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load project.');
        } finally {
            setLoading(false);
        }
    }, [id, statusFilter, severityFilter, searchQuery]);

    const handleLoadMore = async () => {
        if (!nextCursor || loadingMore) return;
        setLoadingMore(true);
        try {
            const res = await api.get(`/projects/${id}/groups`, {
                params: {
                    status: statusFilter,
                    severity: severityFilter,
                    search: searchQuery,
                    limit: 100,
                    cursor: nextCursor,
                },
            });
            const moreGroups = res.data?.data?.groups || [];
            setGroups((prev) => [...prev, ...moreGroups]);
            setNextCursor(res.data?.data?.nextCursor || null);
        } catch (err) {
            console.error('Failed to load more groups', err);
        } finally {
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Live real-time SSE updates. useProjectSSE invokes the handler as
    // (type, payload) — see hooks/useProjectSSE.js — and every message
    // this subscriber receives is already scoped server-side to this
    // one project's channel (sseHub.subscribe(projectId, ...) in
    // sseController.js), so no further type/id filtering is needed
    // here: any message means something in this project changed.
    // (Bug fix: this previously checked `data.type` against event
    // names — 'new_event'/'group_updated'/'heartbeat' — the server
    // never actually publishes; combined with the handler only
    // declaring one parameter while the hook passes two positionally,
    // the condition could never match, so this refetch has been dead
    // code since a since-regressed redesign pass. See DECISIONS.md.)
    const handleSSEMessage = useCallback(() => {
        fetchData(true);
    }, [fetchData]);

    const { connected: sseConnected } = useProjectSSE(id, handleSSEMessage);

    const handleStatusChange = async (groupId, newStatus) => {
        setStatusError('');
        setUpdatingGroupId(groupId);
        try {
            const res = await api.patch(`/groups/${groupId}/status`, { status: newStatus });
            const updated = res.data.data.group;
            setGroups((prev) =>
                prev.map((g) => (g.id === groupId ? { ...g, status: updated.status } : g))
            );
        } catch (err) {
            setStatusError(err.response?.data?.error || 'Failed to update status.');
        } finally {
            setUpdatingGroupId(null);
        }
    };

    const handleSimulate = async () => {
        setSimulating(true);
        setSimulateResult(null);
        setSimulateErrorMsg('');
        try {
            const res = await api.post(`/projects/${id}/simulate`);
            setSimulateResult(res.data.data);
            fetchData(true);
        } catch (err) {
            setSimulateErrorMsg(err.response?.data?.error || 'Simulation failed.');
        } finally {
            setSimulating(false);
        }
    };

    // Preset active state check
    const currentPresetId = PRESETS.find(
        (p) => p.status === statusFilter && p.severity === severityFilter && p.search === searchQuery
    )?.id;

    // Counts
    const openCount = groups.filter((g) => g.status === 'open').length;
    const highSevCount = groups.filter((g) => g.severity === 'critical' || g.severity === 'high').length;

    return (
        <AppLayout currentProjectId={id}>
            {/* Back link */}
            <div style={{ marginBottom: '1rem' }}>
                <Link
                    to="/dashboard"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                        fontWeight: 500
                    }}
                >
                    <ArrowLeft size={14} /> Back to dashboard
                </Link>
            </div>

            {/* Project Header */}
            <div className="dash-header-bar" style={{ marginBottom: '1.5rem' }}>
                <div className="dash-header-info">
                    <h1>{project?.name || 'Project'}</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                        {project?.repo && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                <GitBranch size={13} />
                                {project.repo}
                            </span>
                        )}
                        <span className="system-status-badge">
                            <span className="system-status-dot" />
                            <span>{sseConnected ? 'Live' : 'Connecting…'}</span>
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {groups.length} error groups · {openCount} open · {highSevCount} high severity
                        </span>
                    </div>
                </div>

                <div className="dash-header-actions">
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowSdkSnippet(!showSdkSnippet)}
                    >
                        <Code2 size={13} />
                        Integration Setup
                    </button>

                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowSourceMaps(!showSourceMaps)}
                    >
                        <FileCode size={13} />
                        Source Maps
                    </button>

                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleSimulate}
                        disabled={simulating}
                        title="Inject a test error into this project"
                    >
                        <Terminal size={13} />
                        {simulating ? 'Simulating…' : '$ simulate-error'}
                    </button>
                </div>
            </div>

            {/* Simulation feedback */}
            {simulateResult && (
                <div className="empty-state-compact" style={{ marginBottom: '1.25rem', borderColor: 'var(--accent)' }}>
                    <span className="empty-state-compact-title">Simulation recorded</span>
                    <span className="empty-state-compact-desc">
                        {simulateResult.isNewGroup ? 'New error group created.' : 'Duplicate event recorded.'} Group ID: {simulateResult.errorGroupId}
                    </span>
                </div>
            )}

            {/* SDK Snippet Drawer */}
            {showSdkSnippet && (
                <div style={{ marginBottom: '1.5rem' }}>
                    <SdkSnippetGenerator
                        projectId={id}
                        projectName={project?.name}
                        onClose={() => setShowSdkSnippet(false)}
                    />
                </div>
            )}

            {/* Source Map Manager Drawer */}
            {showSourceMaps && (
                <div style={{ marginBottom: '1.5rem' }}>
                    <SourceMapManager
                        projectId={id}
                        onClose={() => setShowSourceMaps(false)}
                    />
                </div>
            )}

            {/* Filter Toolbar & Presets */}
            <div className="filter-presets-bar">
                {PRESETS.map((p) => (
                    <button
                        key={p.id}
                        type="button"
                        className={`filter-preset-btn ${currentPresetId === p.id ? 'active' : ''}`}
                        onClick={() => applyFilters(p.status, p.severity, p.search)}
                    >
                        {p.label}
                    </button>
                ))}

                {savedViews.map((sv) => (
                    <button
                        key={sv.id}
                        type="button"
                        className={`filter-preset-btn ${
                            statusFilter === sv.status && severityFilter === sv.severity && searchQuery === sv.search ? 'active' : ''
                        }`}
                        onClick={() => applyFilters(sv.status, sv.severity, sv.search)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                        <Bookmark size={11} />
                        {sv.name}
                        <span
                            onClick={(e) => handleDeleteCustomView(sv.id, e)}
                            style={{ marginLeft: '4px', opacity: 0.6 }}
                            title="Delete view"
                        >
                            ×
                        </span>
                    </button>
                ))}

                <button
                    type="button"
                    className="filter-preset-btn"
                    onClick={handleSaveCustomView}
                    title="Save current filters as a named view"
                >
                    + Save view
                </button>
            </div>

            {/* Search & Custom Controls */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 240px' }}>
                    <Search
                        size={14}
                        style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                    />
                    <input
                        type="text"
                        placeholder="Filter by error message or location…"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            updateUrlParams(statusFilter, severityFilter, e.target.value);
                        }}
                        style={{ paddingLeft: '32px', width: '100%' }}
                    />
                </div>

                <select
                    value={statusFilter}
                    onChange={(e) => {
                        setStatusFilter(e.target.value);
                        updateUrlParams(e.target.value, severityFilter, searchQuery);
                    }}
                    style={{ width: '130px' }}
                    aria-label="Filter by status"
                >
                    <option value="all">All Statuses</option>
                    <option value="open">Open</option>
                    <option value="resolved">Resolved</option>
                    <option value="ignored">Ignored</option>
                </select>

                <select
                    value={severityFilter}
                    onChange={(e) => {
                        setSeverityFilter(e.target.value);
                        updateUrlParams(statusFilter, e.target.value, searchQuery);
                    }}
                    style={{ width: '130px' }}
                    aria-label="Filter by severity"
                >
                    <option value="all">All Severities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                </select>
            </div>

            {/* Task 41.5: Incidents section */}
            {incidents.length > 0 && (
                <section className="dash-section">
                    <div className="dash-section-header">
                        <h2 className="dash-section-title">
                            Incidents <span className="dash-section-meta">{incidents.length}</span>
                        </h2>
                    </div>
                    <div className="spikes-list">
                        {incidents.map((incident) => (
                            <Link
                                key={incident.id}
                                to={`/incidents/${incident.id}`}
                                className="spike-row spike-row--wrap"
                                style={incident.status !== 'resolved' ? { borderLeftColor: 'var(--critical)' } : undefined}
                            >
                                <div className="spike-left">
                                    <span
                                        className="spike-tag"
                                        style={
                                            incident.status !== 'resolved'
                                                ? { color: 'var(--critical)', background: 'var(--critical-bg)', borderColor: 'var(--critical-border)' }
                                                : undefined
                                        }
                                    >
                                        {incident.status}
                                    </span>
                                    <span className="spike-title">{incident.title}</span>
                                    {incident.severity && (
                                        <span className={`badge badge-severity-${incident.severity}`}>
                                            {SEVERITY_LABEL[incident.severity] || incident.severity}
                                        </span>
                                    )}
                                </div>
                                <span className="spike-meta">
                                    {incident.affectedGroupsCount} group{incident.affectedGroupsCount === 1 ? '' : 's'} · {formatRelativeTime(incident.createdAt)}
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/* Error Groups Section */}
            <section className="dash-section">
                <div className="dash-section-header">
                    <h2 className="dash-section-title">
                        Error Groups <span className="dash-section-meta">{groups.length} groups</span>
                    </h2>
                </div>

                {loading ? (
                    <ErrorGroupsTableSkeleton count={4} />
                ) : groups.length === 0 ? (
                    <div className="empty-state-card">
                        <div className="empty-state-icon-wrap">
                            <CheckCircle2 size={22} />
                        </div>
                        <h3 className="empty-state-title">No matching errors</h3>
                        <p className="empty-state-desc">
                            No error groups found matching the active filters. Ingest errors via the SDK, adjust your filter criteria, or click "Simulate error" above.
                        </p>
                        {(statusFilter !== 'all' || severityFilter !== 'all' || searchQuery) && (
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                style={{ marginTop: '0.75rem' }}
                                onClick={() => applyFilters(PRESETS[0].status, PRESETS[0].severity, PRESETS[0].search)}
                            >
                                Reset all filters
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th style={{ width: '85px' }}>Severity</th>
                                    <th>Issue</th>
                                    <th style={{ width: '120px' }}>Release</th>
                                    <th style={{ width: '85px', textAlign: 'right' }}>Events</th>
                                    <th style={{ width: '120px' }}>Last Seen</th>
                                    <th style={{ width: '110px' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groups.map((group) => {
                                    const groupId = group.id || group._id;
                                    const sev = group.severity || group.aiSummary?.severity || 'medium';
                                    const rootSnippet = group.aiSummary?.rootCause;
                                    const affectedLoc = group.aiSummary?.affectedFile
                                        ? `${group.aiSummary.affectedFile}${group.aiSummary.affectedFunction ? ` > ${group.aiSummary.affectedFunction}()` : ''}`
                                        : null;

                                    return (
                                        <tr key={groupId} className={`row-hoverable row-${sev}`}>
                                            <td>
                                                <span className={`badge badge-severity-${sev}`}>
                                                    {SEVERITY_LABEL[sev] || sev}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="issue-cell">
                                                    <Link to={`/groups/${groupId}`} className="issue-title-link">
                                                        {group.message}
                                                    </Link>
                                                    {(affectedLoc || rootSnippet) && (
                                                        <span className="issue-subcontext" title={affectedLoc || rootSnippet}>
                                                             {affectedLoc || rootSnippet}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                {group.firstSeenRelease ? (
                                                    <span className="badge-release">{group.firstSeenRelease}</span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                                                {group.count}
                                            </td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                                {formatRelativeTime(group.lastSeen)}
                                            </td>
                                            <td>
                                                <select
                                                    value={group.status}
                                                    onChange={(e) => handleStatusChange(groupId, e.target.value)}
                                                    disabled={updatingGroupId === groupId}
                                                    className={`select-status badge-status-${group.status}`}
                                                    aria-label={`Change status for ${group.message}`}
                                                >
                                                    {STATUS_OPTIONS.map((opt) => (
                                                        <option key={opt} value={opt}>
                                                             {opt.toUpperCase()}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {nextCursor && (
                            <div style={{ padding: '0.85rem', textAlign: 'center', borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={handleLoadMore}
                                    disabled={loadingMore}
                                >
                                    {loadingMore ? 'Loading older errors…' : 'Load older errors'}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </section>
        </AppLayout>
    );
}