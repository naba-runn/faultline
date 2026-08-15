import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import api from '../api/axios.js';
import { useProjectSSE } from '../hooks/useProjectSSE.js';
import SdkSnippetGenerator from '../components/SdkSnippetGenerator.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const SEVERITY_LABEL = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
};

const SEVERITY_COLOR = {
    critical: 'var(--color-danger)',
    high: 'var(--color-warning)',
    medium: 'var(--color-caution)',
    low: 'var(--color-text-muted)',
};

const STATUS_OPTIONS = ['open', 'resolved', 'ignored'];

const PRESETS = [
    { id: 'all', label: 'All', status: 'all', severity: 'all', search: '' },
    { id: 'open', label: 'Open', status: 'open', severity: 'all', search: '' },
    { id: 'unresolved_high', label: 'High/Critical', status: 'open', severity: 'high', search: '' },
    { id: 'resolved', label: 'Resolved', status: 'resolved', severity: 'all', search: '' },
    { id: 'ignored', label: 'Ignored', status: 'ignored', severity: 'all', search: '' },
];

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

function ProjectDetailPage() {
    const { id } = useParams();
    const { user, logout } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();

    const [project, setProject] = useState(null);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [statusError, setStatusError] = useState('');
    const [updatingGroupId, setUpdatingGroupId] = useState(null);

    const [simulating, setSimulating] = useState(false);
    const [simulateResult, setSimulateResult] = useState(null);
    const [simulateError, setSimulateErrorMsg] = useState('');

    const [showSdkSnippet, setShowSdkSnippet] = useState(false);

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

    useEffect(() => {
        projectLoadedRef.current = false;
    }, [id]);

    const fetchData = useCallback(async (silent = false) => {
        if (!projectLoadedRef.current && !silent) {
            setLoading(true);
        }
        setError('');
        try {
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
            setError(err.response?.data?.error || 'Failed to load project.');
        } finally {
            setLoading(false);
        }
    }, [id, statusFilter, severityFilter, searchQuery]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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
        setSimulateErrorMsg('');
        setSimulateResult(null);
        setSimulating(true);
        try {
            const res = await api.post(`/projects/${id}/simulate`);
            const { isNewGroup } = res.data.data;
            setSimulateResult({ isNewGroup });
            await fetchData(true);
        } catch (err) {
            setSimulateErrorMsg(err.response?.data?.error || 'Failed to simulate error.');
        } finally {
            setSimulating(false);
        }
    };

    if (error && !project) {
        return (
            <div className="page">
                <header className="topbar">
                    <div className="topbar-left">
                        <div className="topbar-brand">
                            <h1 className="brand-logo-text">FAULTLINE</h1>
                        </div>
                        <nav className="topbar-nav">
                            <Link to="/dashboard" className="topbar-link">Dashboard</Link>
                            <Link to="/docs" className="topbar-link">API Docs</Link>
                        </nav>
                    </div>
                </header>
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
            {/* Topbar */}
            <header className="topbar">
                <div className="topbar-left">
                    <div className="topbar-brand">
                        <h1 className="brand-logo-text">FAULTLINE</h1>
                    </div>
                    <nav className="topbar-nav">
                        <Link to="/dashboard" className="topbar-link">Dashboard</Link>
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
            <div style={{ marginBottom: '1.25rem' }}>
                <Link to="/dashboard" className="back-link" style={{ marginBottom: '0.5rem' }}>← Projects</Link>

                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                    <div>
                        {loading && !project ? (
                            <>
                                <span className="skeleton" style={{ width: '220px', height: '24px', marginBottom: '0.35rem', display: 'block' }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.2rem' }}>
                                    <span className="skeleton" style={{ width: '130px', height: '14px' }} />
                                    <span className="skeleton" style={{ width: '45px', height: '14px' }} />
                                </div>
                                <div style={{ marginTop: '0.35rem' }}>
                                    <span className="skeleton" style={{ width: '260px', height: '12px' }} />
                                </div>
                            </>
                        ) : (
                            <>
                                <h1 style={{ margin: '0 0 0.2rem 0', fontSize: '1.35rem' }}>{project?.name}</h1>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                                    {project?.githubRepo && (
                                        <span className="mono" style={{ fontSize: '0.75rem' }}>{project.githubRepo}</span>
                                    )}
                                    <span className={`live-indicator${liveConnected ? ' is-connected' : ''}`}>
                                        <span className="live-indicator-dot" />
                                        {liveConnected ? 'Live' : 'Connecting…'}
                                    </span>
                                </div>
                                <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                                    {totalGroupsCount} error groups · {openGroupsCount} open · {highSeverityCount} high severity
                                </div>
                            </>
                        )}
                    </div>

                    {/* Action Bar */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                            type="button"
                            className={`btn-tab ${showSdkSnippet ? 'active' : ''}`}
                            onClick={() => setShowSdkSnippet((prev) => !prev)}
                            style={{ height: '24px', fontSize: '0.72rem' }}
                        >
                            {showSdkSnippet ? 'Hide Setup' : 'Integration Setup'}
                        </button>
                        <div className="simulate-action">
                            <button
                                type="button"
                                className="simulate-btn"
                                onClick={handleSimulate}
                                disabled={simulating || loading}
                            >
                                {simulating ? 'simulating…' : 'simulate-error'}
                            </button>
                            {simulateResult && (
                                <span className="simulate-result">
                                    {simulateResult.isNewGroup ? 'New group.' : 'Duplicate recorded.'}
                                </span>
                            )}
                            {simulateError && <span className="alert alert-error" role="alert" style={{ margin: 0, padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>{simulateError}</span>}
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter Toolbar */}
            <div className="filter-toolbar">
                <div className="filter-presets">
                    {PRESETS.map((p) => {
                        const isActive =
                            statusFilter === p.status &&
                            severityFilter === p.severity &&
                            searchQuery === p.search;
                        return (
                            <button
                                key={p.id}
                                type="button"
                                className={`preset-tab ${isActive ? 'active' : ''}`}
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
                        + Save view
                    </button>
                </div>

                <div className="filter-controls">
                    <div className="filter-field">
                        <label htmlFor="search-input">Search</label>
                        <input
                            id="search-input"
                            type="text"
                            placeholder="Filter by error message…"
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
                            <option value="all">All</option>
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
                            <option value="all">All</option>
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
                            style={{ alignSelf: 'flex-end' }}
                        >
                            Reset
                        </button>
                    )}
                </div>
            </div>

            {/* Error Groups */}
            <div className="section-header-inline">
                <h2 style={{ fontSize: '0.85rem' }}>Error Groups</h2>
                {loading && groups.length === 0 ? (
                    <span className="skeleton" style={{ width: '45px', height: '14px' }} />
                ) : (
                    <span className="mono-count">{groups.length} groups</span>
                )}
            </div>

            {statusError && <p className="alert alert-error" role="alert">{statusError}</p>}

            {loading && groups.length === 0 ? (
                <div className="incident-list" aria-busy="true" aria-label="Loading error groups">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="incident-row" style={{ pointerEvents: 'none' }}>
                            <div className="incident-severity">
                                <span className="skeleton" style={{ width: '50px', height: '14px' }} />
                            </div>
                            <div className="incident-content">
                                <span className="skeleton" style={{ width: `${60 + (i * 10) % 25}%`, height: '14px' }} />
                                <div className="incident-meta" style={{ marginTop: '0.25rem' }}>
                                    <span className="skeleton" style={{ width: '60px', height: '16px' }} />
                                    {' · '}
                                    <span className="skeleton" style={{ width: `${40 + (i * 7) % 30}%`, height: '12px' }} />
                                </div>
                            </div>
                            <div className="incident-stats">
                                <span className="skeleton" style={{ width: '20px', height: '14px', marginBottom: '2px', display: 'block', marginLeft: 'auto' }} />
                                <span className="skeleton" style={{ width: '42px', height: '11px' }} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : groups.length === 0 ? (
                statusFilter !== 'all' || severityFilter !== 'all' || Boolean(searchQuery.trim()) ? (
                    <div className="empty-state">
                        <h3>No error groups match</h3>
                        <p className="cell-muted" style={{ fontSize: '0.82rem' }}>
                            No errors match your current filter settings. Try resetting filters, or click <strong style={{ color: 'var(--color-text)' }}>simulate-error</strong> above.
                        </p>
                    </div>
                ) : (
                    <div className="setup-guide">
                        <div className="setup-guide-header">
                            <h3 className="setup-guide-title">Connect your application</h3>
                            <p className="setup-guide-desc">
                                Faultline tracks runtime errors sent from your application via authenticated HTTP ingestion.
                            </p>
                        </div>

                        <div className="setup-steps">
                            <div className="setup-step">
                                <div className="setup-step-heading">
                                    <span className="setup-step-num">01</span>
                                    <h4 className="setup-step-title">Obtain and configure your API key</h4>
                                </div>
                                <p className="setup-step-body">
                                    API keys authenticate runtime error ingestion. Set your project key as an environment variable (e.g. <code>FAULTLINE_API_KEY</code>). Store this key securely and never commit it to source control or expose it in frontend code.
                                </p>
                                {project?.githubRepo && (
                                    <div className="setup-notice">
                                        <strong>GitHub Repository Context:</strong> <code>{project.githubRepo}</code> is linked for AI source-code grounding during analysis. It does <em>not</em> automatically instrument your application — your code must send error events.
                                    </div>
                                )}
                            </div>

                            <div className="setup-step">
                                <div className="setup-step-heading">
                                    <span className="setup-step-num">02</span>
                                    <h4 className="setup-step-title">Configure your application to report errors</h4>
                                </div>
                                <p className="setup-step-body">
                                    Send JSON error payloads to <code>POST /api/events</code> with <code>Authorization: Bearer &lt;API_KEY&gt;</code>.
                                </p>
                                <SdkSnippetGenerator projectName={project?.name} />
                            </div>

                            <div className="setup-step">
                                <div className="setup-step-heading">
                                    <span className="setup-step-num">03</span>
                                    <h4 className="setup-step-title">Send your first error</h4>
                                </div>
                                <p className="setup-step-body">
                                    1. Configure your application with the API key.<br />
                                    2. Capture or trigger an exception in your code.<br />
                                    3. Send the exception payload to Faultline.<br />
                                    4. Return to this page to view the resulting error group, stack trace, and AI root cause analysis.
                                </p>
                                <div style={{ marginTop: '0.4rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <Link to="/docs" className="topbar-link" style={{ fontSize: '0.78rem', textDecoration: 'underline' }}>
                                        View complete API reference →
                                    </Link>
                                    <span className="cell-muted" style={{ fontSize: '0.75rem' }}>
                                        Tip: You can also click <strong>simulate-error</strong> above to test dashboard functionality immediately.
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            ) : (
                <>
                    {showSdkSnippet && (
                        <div className="setup-guide" style={{ marginBottom: '1.25rem' }}>
                            <div className="setup-guide-header">
                                <h3 className="setup-guide-title">Integration Setup</h3>
                                <p className="setup-guide-desc">
                                    HTTP error reporting configuration for <strong>{project?.name}</strong>.
                                </p>
                            </div>
                            <SdkSnippetGenerator projectName={project?.name} />
                            <div style={{ marginTop: '0.5rem' }}>
                                <Link to="/docs" className="topbar-link" style={{ fontSize: '0.78rem', textDecoration: 'underline' }}>
                                    View complete API reference →
                                </Link>
                            </div>
                        </div>
                    )}
                    <div className="incident-list incident-list-scroll">
                        {groups.map((group) => {
                            const severity = group.aiSummary?.severity?.toLowerCase();
                            const severityColor = SEVERITY_COLOR[severity] || 'var(--color-text-faint)';
                            return (
                                <div key={group.id} className="incident-row">
                                    <div
                                        className="incident-severity"
                                        style={{ color: severityColor }}
                                    >
                                        {SEVERITY_LABEL[severity] || '—'}
                                    </div>
                                    <div className="incident-content">
                                        <Link to={`/groups/${group.id}`} className="incident-message">
                                            {group.message}
                                        </Link>
                                        <div className="incident-meta">
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
                                            {group.firstSeenRelease && <>{' · '}<span className="mono" style={{ fontSize: '0.72rem' }}>{group.firstSeenRelease}</span></>}
                                            {group.aiSummary?.rootCause && <>{' · '}<span style={{ color: 'var(--color-text-faint)', fontSize: '0.72rem' }}>{group.aiSummary.rootCause.length > 60 ? group.aiSummary.rootCause.slice(0, 60) + '…' : group.aiSummary.rootCause}</span></>}
                                        </div>
                                    </div>
                                    <div className="incident-stats">
                                        <div className="incident-count">{group.count}</div>
                                        <div>{formatRelativeTime(group.lastSeen)}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

export default ProjectDetailPage;