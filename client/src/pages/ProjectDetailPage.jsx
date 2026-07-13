import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios.js';
import { useProjectSSE } from '../hooks/useProjectSSE.js';

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
// for this project (see hooks/useProjectSSE.js).
function ProjectDetailPage() {
    const { id } = useParams();

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

    const fetchData = useCallback(async (silent = false) => {
        // silent=true is used for SSE-triggered refetches (Task 26) —
        // toggling `loading` on every live push would blank the whole
        // table each time an event arrives, which defeats the purpose
        // of a *live*, non-disruptive update. The initial page-load
        // call below still uses the default (silent=false).
        if (!silent) setLoading(true);
        setError('');
        try {
            // Two independent GETs rather than relying on one endpoint to
            // return both — matches the server's actual route split
            // (GET /api/projects/:id and GET /api/projects/:id/groups are
            // separate endpoints; see docs/API.md).
            const [projectRes, groupsRes] = await Promise.all([
                api.get(`/projects/${id}`),
                api.get(`/projects/${id}/groups`),
            ]);
            setProject(projectRes.data.data.project);
            setGroups(groupsRes.data.data.groups);
        } catch (err) {
            // docs/API.md: GET /projects/:id 404s identically whether the
            // project doesn't exist, belongs to someone else, or :id is
            // malformed — surfaced here as-is, no attempt to distinguish.
            setError(err.response?.data?.error || 'Failed to load project.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Task 26: live updates. Any of the three published event types
    // (new_group, status_changed, enrichment_completed) means this
    // page's table is now stale — a silent refetch is simpler and
    // safer than surgically patching one row's state client-side, at
    // the cost of a bit more network chatter than a hand-patched
    // update would need. See docs/DECISIONS.md's "Task 26" entry.
    const { connected: liveConnected } = useProjectSSE(id, () => {
        fetchData(true);
    });

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
            await fetchData();
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

    return (
        <div className="page">
            <Link to="/dashboard" className="back-link">← Back to dashboard</Link>
            <header className="topbar">
                <h1>{project.name}</h1>
                <p className="topbar-meta mono">
                    {project.githubRepo || 'no repo linked'}
                    {' · '}
                    <span className={`live-indicator${liveConnected ? ' is-connected' : ''}`}>
                        <span className="live-indicator-dot" />
                        {liveConnected ? 'live' : 'connecting…'}
                    </span>
                </p>
            </header>

            <section className="card">
                <h2>Simulate error</h2>
                <div className="simulate-panel">
                    <button
                        type="button"
                        className="simulate-btn"
                        onClick={handleSimulate}
                        disabled={simulating}
                    >
                        {simulating ? 'simulating...' : 'simulate-error'}
                    </button>
                    {simulateResult && (
                        <span className="simulate-result">
                            {simulateResult.isNewGroup ? (
                                <>
                                    <strong>new group created</strong> — AI analysis will appear on its
                                    detail page shortly.
                                </>
                            ) : (
                                <>
                                    <strong>duplicate recorded</strong> — matched an existing group,
                                    count incremented.
                                </>
                            )}
                        </span>
                    )}
                    {simulateError && <span className="simulate-result">{simulateError}</span>}
                </div>
            </section>

            <h2>Error groups</h2>
            {statusError && <p className="alert alert-error" role="alert">{statusError}</p>}
            {groups.length === 0 ? (
                <p className="cell-muted">No errors reported yet for this project.</p>
            ) : (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Message</th>
                                <th>Status</th>
                                <th>Severity</th>
                                <th>Count</th>
                                <th>Last seen</th>
                            </tr>
                        </thead>
                        <tbody>
                            {groups.map((group) => (
                                <tr key={group.id}>
                                    <td className="cell-message">
                                        <Link to={`/groups/${group.id}`}>{group.message}</Link>
                                    </td>
                                    <td>
                                        <select
                                            value={group.status}
                                            disabled={updatingGroupId === group.id}
                                            onChange={(e) => handleStatusChange(group.id, e.target.value)}
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
                                    <td>{group.count}</td>
                                    <td className="cell-muted">{formatDate(group.lastSeen)}</td>
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