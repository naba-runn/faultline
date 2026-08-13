import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import api from '../api/axios.js';
import { useProjectSSE } from '../hooks/useProjectSSE.js';
import SdkSnippetGenerator from '../components/SdkSnippetGenerator.jsx';

// Severity/status badge classes live in index.css (.badge-severity-*,
// .badge-status-*) — Task 23's dark theme pass. Label maps stay here
// since they're presentation-only lookups, not styling.
const SEVERITY_LABEL = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
};

// Same three values as the server's ErrorGroup status enum
// (server/models/ErrorGroup.js) — a plain <select>, not a fancier
// control; polish is Milestone 5's job (Task 23), not this task's.
const STATUS_OPTIONS = ['open', 'resolved', 'ignored'];

// Task 33: Filter presets for error groups list
const PRESETS = [
    { id: 'all', label: 'All Errors', status: 'all', severity: 'all', search: '' },
    { id: 'open', label: 'Open Errors', status: 'open', severity: 'all', search: '' },
    { id: 'unresolved_high', label: 'Unresolved High/Critical', status: 'open', severity: 'high', search: '' },
    { id: 'resolved', label: 'Resolved', status: 'resolved', severity: 'all', search: '' },
    { id: 'ignored', label: 'Ignored', status: 'ignored', severity: 'all', search: '' },
];

function formatDate(iso) {
    return new Date(iso).toLocaleString();
}

function SeverityBadge({ severity }) {
    if (!severity) return <span className="cell-muted">—</span>;
    return (
        <span className={`badge badge-severity-${severity}`}>
            {SEVERITY_LABEL[severity] || severity}
        </span>
    );
}

// Project detail + error group table (Task 17), plus status updates
// (Task 18's PATCH /api/groups/:id/status). Task 19 links each row's
// message to the per-group ErrorGroupDetail page at /groups/:id. Task
// 23 adds the dark theme/table polish and the "Simulate Error" button
// (POST /api/projects/:id/simulate — see docs/API.md and
// projectController.simulateError for why this is a separate,
// JWT-authed endpoint rather than reusing the API-key-only ingestion
// route). Task 26 adds a live "connected" indicator and a silent
// background refetch whenever the SSE stream reports a relevant event
// for this project (see hooks/useProjectSSE.js). Task 33 adds search,
// status, severity filters, URL sync, and custom saved views.
function ProjectDetailPage() {
    const { id } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();

    const [project, setProject] = useState(null);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    // Separate from the page-load `error` above — this is scoped to a
    // single row's status PATCH failing, not the initial GETs.
    const [statusError, setStatusError] = useState('');
    // Tracks which group's PATCH is in flight, so only that row's
    // <select> disables — not the whole table.
    const [updatingGroupId, setUpdatingGroupId] = useState(null);

    // Simulate Error button state. Separate from the page-load error/
    // loading above, same reasoning as statusError/updatingGroupId.
    const [simulating, setSimulating] = useState(false);
    const [simulateResult, setSimulateResult] = useState(null);
    const [simulateError, setSimulateErrorMsg] = useState('');

    // Task 34: Onboarding SDK Snippet toggle state
    const [showSdkSnippet, setShowSdkSnippet] = useState(false);

    // Task 33: Search, filter, and saved views state synced with URL search params
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

    // Reset projectLoadedRef when project ID changes so navigating between projects
    // shows initial loading screen for the new project.
    useEffect(() => {
        projectLoadedRef.current = false;
    }, [id]);

    const fetchData = useCallback(async (silent = false) => {
        // Only trigger full-page loading screen on initial project load.
        // Subsequent filter changes & refetches update groups silently in-place
        // without blanking the page UI.
        if (!projectLoadedRef.current && !silent) {
            setLoading(true);
        }
        setError('');
        try {
            // Two independent GETs rather than relying on one endpoint to
            // return both — matches the server's actual route split
            // (GET /api/projects/:id and GET /api/projects/:id/groups are
            // separate endpoints; see docs/API.md).
            const [projectRes, groupsRes] = await Promise.all([
                api.get(`/projects/${id}`),
                api.get(`/projects/${id}/groups`, {
                    params: {
                        status: statusFilter,
                        severity: severityFilter,
                        search: searchQuery,
                    },
                }),
            ]);
            setProject(projectRes.data.data.project);
            setGroups(groupsRes.data.data.groups);
            projectLoadedRef.current = true;
        } catch (err) {
            // docs/API.md: GET /projects/:id 404s identically whether the
            // project doesn't exist, belongs to someone else, or :id is
            // malformed — surfaced here as-is, no attempt to distinguish.
            setError(err.response?.data?.error || 'Failed to load project.');
        } finally {
            setLoading(false);
        }
    }, [id, statusFilter, severityFilter, searchQuery]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Task 26: live updates. Any of the four published event types
    // (new_group, duplicate_recorded, status_changed,
    // enrichment_completed) means this page's table is now stale — a
    // silent refetch is simpler and safer than surgically patching one
    // row's state client-side, at the cost of a bit more network
    // chatter than a hand-patched update would need. See
    // docs/DECISIONS.md's "Task 26" entry.
    //
    // Debounced: this tab is subscribed to its own project's channel,
    // so an action taken in THIS tab (e.g. clicking Simulate Error)
    // triggers both a direct fetchData() from the click handler below
    // AND, moments later, its own published event bouncing back over
    // SSE — a real redundant-refetch gap found via manual testing (see
    // docs/DECISIONS.md's "Redundant self-triggered refetches" entry).
    // Coalescing rapid-fire triggers into one fetchData() call after a
    // short quiet window fixes that without needing to thread a
    // per-connection client ID through the server just to filter out
    // "events this tab caused."
    const refetchDebounceRef = useRef(null);
    const { connected: liveConnected } = useProjectSSE(id, () => {
        if (refetchDebounceRef.current) clearTimeout(refetchDebounceRef.current);
        refetchDebounceRef.current = setTimeout(() => {
            fetchData(true);
        }, 400);
    });

    useEffect(() => {
        return () => {
            if (refetchDebounceRef.current) clearTimeout(refetchDebounceRef.current);
        };
    }, []);

    // Optimistic-ish update: apply the new status to local state only
    // after the PATCH succeeds (not before), so a failed request never
    // shows a status the server didn't actually record. On failure the
    // <select> simply re-renders with the still-unchanged `groups`
    // state — no manual revert needed since we never wrote the
    // optimistic value in the first place.
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

    // Triggers POST /api/projects/:id/simulate, then refetches the
    // group list so the affected row (new or duplicate) appears/updates
    // immediately. AI enrichment is fire-and-forget server-side (same
    // dispatch model as real ingestion — AI_CONTEXT.md), so a brand-new
    // group's aiSummary won't be populated in this immediate refetch;
    // the result line says so rather than implying it's already there.
    const handleSimulate = async () => {
        setSimulateErrorMsg('');
        setSimulateResult(null);
        setSimulating(true);
        try {
            const res = await api.post(`/projects/${id}/simulate`);
            const { isNewGroup } = res.data.data;
            setSimulateResult({ isNewGroup });
            // silent=true: the button already shows its own "simulating..."
            // feedback while this request is in flight (see `simulating`
            // state below) -- refetching non-silently here would blank
            // the entire page (topbar, live indicator, table) down to a
            // single "Loading project..." line and back, which looks
            // exactly like a page reload even though it's pure React
            // state. Found via manual testing -- see DECISIONS.md's
            // "The actual page-reload mystery" entry.
            await fetchData(true);
        } catch (err) {
            setSimulateErrorMsg(err.response?.data?.error || 'Failed to simulate error.');
        } finally {
            setSimulating(false);
        }
    };

    if (loading) {
        return (
            <div className="page">
                <p className="cell-muted">Loading project...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="page">
                <p className="alert alert-error" role="alert">{error}</p>
                <Link to="/dashboard" className="back-link">← Back to dashboard</Link>
            </div>
        );
    }

    const totalGroupsCount = groups.length;
    const openGroupsCount = groups.filter(g => g.status === 'OPEN').length;
    const highSeverityCount = groups.filter(g => g.severity === 'HIGH' || g.severity === 'CRITICAL').length;

    return (
        <div className="page">
            {/* Top Fixed Header */}
            <header className="topbar">
                <div className="topbar-brand">
                    <h1 className="brand-logo-text">FAULTLINE</h1>
                    <div className="status-pill-badge">
                        <span className={`live-indicator-dot${liveConnected ? ' is-connected' : ''}`} style={{ background: 'var(--color-accent)' }} />
                        <span>{liveConnected ? 'Live: All systems nominal' : 'Connecting…'}</span>
                    </div>
                </div>
                <div className="topbar-meta">
                    <Link to="/dashboard" className="topbar-link">Dashboard</Link>
                    <Link to={`/projects/${id}`} className="topbar-link active">Projects</Link>
                    <Link to="/docs" className="topbar-link">API Docs</Link>
                </div>
            </header>

            {/* Breadcrumb & Project Title Header */}
            <div style={{ margin: '1rem 0 1.5rem 0' }}>
                <div className="breadcrumb-nav">
                    <Link to="/dashboard" className="back-link">← Back to dashboard</Link>
                    <span className="cell-muted">/</span>
                    <span className="mono font-bold" style={{ color: 'var(--color-text)' }}>{project.name}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginTop: '0.5rem' }}>
                    <h1 className="font-headline-lg" style={{ margin: 0, fontSize: '1.8rem' }}>{project.name}</h1>
                    <span className="mono cell-muted" style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>GitHub: <strong>{project.githubRepo || 'no repo linked'}</strong></span>
                        <span className="live-indicator-dot" style={{ background: 'var(--color-accent)' }} />
                        <span style={{ color: 'var(--color-accent)' }}>Live</span>
                    </span>
                </div>
            </div>

            {/* Summary & Actions Bento */}
            <div className="metrics-overview-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '1.75rem' }}>
                <div className="stat-card">
                    <span className="stat-label">ERROR GROUPS</span>
                    <span className="stat-value">{totalGroupsCount}</span>
                </div>
                <div className="stat-card" style={{ borderLeft: '3px solid var(--color-warning)' }}>
                    <span className="stat-label">OPEN</span>
                    <span className="stat-value">{openGroupsCount}</span>
                </div>
                <div className="stat-card" style={{ borderLeft: '3px solid var(--color-danger)' }}>
                    <span className="stat-label">HIGH SEVERITY</span>
                    <span className="stat-value">{highSeverityCount}</span>
                </div>
                <div className="stat-card" style={{ background: 'var(--color-surface-container)', justifyContent: 'space-between' }}>
                    <div>
                        <span className="stat-label">DEVELOPMENT</span>
                        <p className="cell-muted" style={{ fontSize: '0.78rem', margin: '0.2rem 0 0.5rem 0' }}>
                            Trigger a test error to verify ingestion & AI rules.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="btn btn-primary btn-sm btn-full"
                        onClick={handleSimulate}
                        disabled={simulating}
                    >
                        {simulating ? 'Simulating...' : 'SIMULATE ERROR →'}
                    </button>
                </div>
            </div>

            <section className="card filter-card">
                <div className="filter-presets">
                    <span className="filter-label">Views:</span>
                    {PRESETS.map((p) => {
                        const isActive =
                            statusFilter === p.status &&
                            severityFilter === p.severity &&
                            searchQuery === p.search;
                        return (
                            <button
                                key={p.id}
                                type="button"
                                className={`preset-pill ${isActive ? 'active' : ''}`}
                                onClick={() => applyFilters(p.status, p.severity, p.search)}
                            >
                                {p.label}
                            </button>
                        );
                    })}
                    {savedViews.map((sv) => {
                        const isActive =
                            statusFilter === sv.status &&
                            severityFilter === sv.severity &&
                            searchQuery === sv.search;
                        return (
                            <span
                                key={sv.id}
                                className={`preset-pill custom ${isActive ? 'active' : ''}`}
                                onClick={() => applyFilters(sv.status, sv.severity, sv.search)}
                            >
                                {sv.name}
                                <button
                                    type="button"
                                    className="delete-view-btn"
                                    onClick={(e) => handleDeleteCustomView(sv.id, e)}
                                    title="Delete saved view"
                                >
                                    ×
                                </button>
                            </span>
                        );
                    })}
                    <button type="button" className="btn-secondary btn-sm" onClick={handleSaveCustomView}>
                        + Save View
                    </button>
                </div>

                <div className="filter-controls">
                    <div className="filter-field">
                        <label htmlFor="search-input">Search message</label>
                        <input
                            id="search-input"
                            type="text"
                            placeholder="Filter by error message or stack..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                updateUrlParams(statusFilter, severityFilter, e.target.value);
                            }}
                        />
                    </div>
                    <div className="filter-field">
                        <label htmlFor="status-filter">Status</label>
                        <select
                            id="status-filter"
                            value={statusFilter}
                            onChange={(e) => {
                                setStatusFilter(e.target.value);
                                updateUrlParams(e.target.value, severityFilter, searchQuery);
                            }}
                        >
                            <option value="all">All Statuses</option>
                            <option value="open">open</option>
                            <option value="resolved">resolved</option>
                            <option value="ignored">ignored</option>
                        </select>
                    </div>
                    <div className="filter-field">
                        <label htmlFor="severity-filter">Severity</label>
                        <select
                            id="severity-filter"
                            value={severityFilter}
                            onChange={(e) => {
                                setSeverityFilter(e.target.value);
                                updateUrlParams(statusFilter, e.target.value, searchQuery);
                            }}
                        >
                            <option value="all">All Severities</option>
                            <option value="low">low</option>
                            <option value="medium">medium</option>
                            <option value="high">high</option>
                            <option value="critical">critical</option>
                        </select>
                    </div>
                    {(statusFilter !== 'all' || severityFilter !== 'all' || searchQuery !== '') && (
                        <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={() => applyFilters('all', 'all', '')}
                            style={{ alignSelf: 'flex-end', marginBottom: '4px' }}
                        >
                            Reset filters
                        </button>
                    )}
                </div>
            </section>

            <div className="section-header-inline" style={{ marginTop: '2.25rem' }}>
                <h2>Reported Error Groups</h2>
                <span className="mono-count">{groups.length} groups</span>
            </div>

            {statusError && <p className="alert alert-error" role="alert">{statusError}</p>}
            {groups.length === 0 ? (
                <div className="card empty-state-card">
                    <h3>No error groups recorded yet</h3>
                    <p className="cell-muted">
                        Connect your app using your API key or click <strong style={{ color: 'var(--color-text)' }}>Simulate Error</strong> above to test the ingestion pipeline.
                    </p>
                </div>
            ) : (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>INCIDENT / MESSAGE</th>
                                <th>STATUS</th>
                                <th>SEVERITY</th>
                                <th style={{ textAlign: 'center' }}>COUNT</th>
                                <th>LAST SEEN</th>
                            </tr>
                        </thead>
                        <tbody>
                            {groups.map((group) => (
                                <tr key={group.id} className="row-hoverable">
                                    <td className="cell-message">
                                        <Link to={`/groups/${group.id}`} className="group-title-link">
                                            {group.message}
                                        </Link>
                                    </td>
                                    <td>
                                        <select
                                            id={`status-${group.id}`}
                                            name={`status-${group.id}`}
                                            aria-label={`Status for ${group.message}`}
                                            value={group.status}
                                            disabled={updatingGroupId === group.id}
                                            onChange={(e) => handleStatusChange(group.id, e.target.value)}
                                            className={`select-status badge-status-${group.status}`}
                                        >
                                            {STATUS_OPTIONS.map((status) => (
                                                <option key={status} value={status}>
                                                    {status}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td>
                                        <SeverityBadge severity={group.aiSummary?.severity} />
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span className="count-pill mono">{group.count}</span>
                                    </td>
                                    <td className="cell-muted mono" style={{ fontSize: '0.8rem' }}>
                                        {formatDate(group.lastSeen)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default ProjectDetailPage;