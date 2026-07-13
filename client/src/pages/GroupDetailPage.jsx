import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios.js';
import { useProjectSSE } from '../hooks/useProjectSSE.js';

// Same map as ProjectDetailPage.jsx — kept duplicated rather than
// extracted to a shared module for one small constant used in two
// places (see PROJECT_RULES.md §11 on premature abstraction).
const SEVERITY_LABEL = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
};

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

function StatusBadge({ status }) {
    return <span className={`badge badge-status-${status}`}>{status}</span>;
}

// Buckets the (already-capped, most-recent-first) events by calendar
// day, ascending, for the sparkline. This only ever sees the same
// window of events the page already fetched — it does not requery the
// server for the group's full lifetime history.
function buildSparklineBuckets(events) {
    if (events.length === 0) return [];

    const counts = new Map();
    events.forEach((event) => {
        const day = new Date(event.receivedAt).toISOString().slice(0, 10);
        counts.set(day, (counts.get(day) || 0) + 1);
    });

    return Array.from(counts.entries())
        .sort(([dayA], [dayB]) => (dayA < dayB ? -1 : 1))
        .map(([day, count]) => ({ day, count }));
}

// Minimal hand-rolled inline SVG line — no charting library added for
// one sparkline (client/package.json has none; adding one would be
// exactly the kind of unprompted dependency PROJECT_RULES.md §2 rules
// out). Colors deliberately left to `currentColor`, which now resolves
// to the accent teal via the .sparkline-wrap class (Task 23's theme).
function Sparkline({ buckets }) {
    if (buckets.length === 0) {
        return <p className="cell-muted">No event data to chart yet.</p>;
    }

    if (buckets.length === 1) {
        return (
            <p className="cell-muted">
                Only one day of data in the current window ({buckets[0].count} event
                {buckets[0].count === 1 ? '' : 's'} on {buckets[0].day}) — not enough to
                show a trend line yet.
            </p>
        );
    }

    const width = 300;
    const height = 60;
    const maxCount = Math.max(...buckets.map((bucket) => bucket.count));
    const stepX = width / (buckets.length - 1);

    const points = buckets
        .map((bucket, index) => {
            const x = index * stepX;
            // Headroom so the max-value point isn't clipped at the top edge.
            const y = height - (bucket.count / maxCount) * (height - 10) - 5;
            return `${x},${y}`;
        })
        .join(' ');

    return (
        <div className="sparkline-wrap">
            <svg
                viewBox={`0 0 ${width} ${height}`}
                width={width}
                height={height}
                role="img"
                aria-label="Event count per day"
            >
                <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
        </div>
    );
}

// Renders suggestedFix as a checklist per Task 19's spec. Checked
// state is local-only React state, never sent to the server —
// suggestedFix is a plain string array with no stable id to persist
// against, and persisting "worked on this step" state wasn't asked
// for (would need a new ErrorGroup field; see PROJECT_RULES.md §2).
// It intentionally resets on reload — a scratch pad for the current
// view, not a saved record.
function AiChecklist({ suggestedFix }) {
    const [checked, setChecked] = useState({});

    function toggle(index) {
        setChecked((prev) => ({ ...prev, [index]: !prev[index] }));
    }

    return (
        <ul>
            {suggestedFix.map((step, index) => (
                <li key={index}>
                    <label className="field-inline">
                        <input
                            type="checkbox"
                            checked={Boolean(checked[index])}
                            onChange={() => toggle(index)}
                        />
                        <span className="mono">{step}</span>
                    </label>
                </li>
            ))}
        </ul>
    );
}

// Task 19: ErrorGroupDetail page. Fetches the newly added
// GET /api/groups/:id, which returns { group, events } as one combined
// payload (see docs/DECISIONS.md, "Task 19" for why one endpoint, not
// two). Status is shown read-only here — changing it stays on
// ProjectDetailPage (Task 18's PATCH), not duplicated on this page,
// per PROJECT_RULES.md §2's no-scope-creep rule. Task 23 adds the
// dark theme/badge/table polish. Task 26 adds a live "connected"
// indicator and a silent background refetch when the SSE stream
// reports a status change or enrichment completion for *this specific
// group* (filtered by errorGroupId — a status_changed event for a
// different group in the same project shouldn't refetch this page).
function GroupDetailPage() {
    const { id } = useParams();

    const [group, setGroup] = useState(null);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchData = useCallback(async (silent = false) => {
        // silent=true for SSE-triggered refetches (Task 26) — see the
        // same reasoning in ProjectDetailPage.jsx's fetchData.
        if (!silent) setLoading(true);
        setError('');
        try {
            const res = await api.get(`/groups/${id}`);
            setGroup(res.data.data.group);
            setEvents(res.data.data.events);
        } catch (err) {
            // docs/API.md: 404 covers not-found, not-yours, and a malformed
            // :id identically — surfaced as-is, same as ProjectDetailPage.
            setError(err.response?.data?.error || 'Failed to load error group.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Task 26: subscribes once `group.projectId` is known (undefined
    // before the first fetch resolves — useProjectSSE no-ops until
    // then, then connects automatically once it's set). Filters to
    // this specific group so an unrelated group's event in the same
    // project doesn't trigger a pointless refetch here.
    const { connected: liveConnected } = useProjectSSE(group?.projectId, (type, payload) => {
        if (payload?.errorGroupId === id) {
            fetchData(true);
        }
    });

    if (loading) {
        return (
            <div className="page">
                <p className="cell-muted">Loading error group...</p>
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

    const aiSummary = group.aiSummary;
    const buckets = buildSparklineBuckets(events);

    return (
        <div className="page">
            <Link to={`/projects/${group.projectId}`} className="back-link">← Back to project</Link>

            <header>
                <h1 className="mono">{group.message}</h1>
                <p className="topbar-meta">
                    <StatusBadge status={group.status} />
                    {' · '}Seen {group.count} time{group.count === 1 ? '' : 's'}
                    {' · '}First seen {formatDate(group.firstSeen)}
                    {' · '}Last seen {formatDate(group.lastSeen)}
                    {' · '}
                    <span className={`live-indicator${liveConnected ? ' is-connected' : ''}`}>
                        <span className="live-indicator-dot" />
                        {liveConnected ? 'live' : 'connecting…'}
                    </span>
                </p>
            </header>

            <section className="card">
                <h2>AI analysis</h2>
                {aiSummary ? (
                    <div>
                        <p>
                            <SeverityBadge severity={aiSummary.severity} />
                            {' · '}
                            Confidence:{' '}
                            <span className="mono">
                                {typeof aiSummary.confidence === 'number'
                                    ? `${Math.round(aiSummary.confidence * 100)}%`
                                    : '—'}
                            </span>
                            {aiSummary.affectedFile && (
                                <>
                                    {' · '}
                                    <span className="mono cell-muted">
                                        {aiSummary.affectedFile}
                                        {aiSummary.affectedFunction ? ` (${aiSummary.affectedFunction})` : ''}
                                    </span>
                                </>
                            )}
                        </p>
                        <p>{aiSummary.rootCause}</p>
                        {aiSummary.suggestedFix && aiSummary.suggestedFix.length > 0 && (
                            <>
                                <h2>Suggested fix</h2>
                                <AiChecklist suggestedFix={aiSummary.suggestedFix} />
                                <p className="cell-muted">
                                    <em>Checklist state is local to this page view — it isn't saved.</em>
                                </p>
                            </>
                        )}
                    </div>
                ) : (
                    <p className="cell-muted">No AI analysis available yet for this error group.</p>
                )}
            </section>

            <section className="card">
                <h2>Activity</h2>
                <p className="cell-muted">
                    Event volume — last {events.length} occurrence{events.length === 1 ? '' : 's'} fetched
                    {group.count > events.length ? ` (of ${group.count} total)` : ''}.
                </p>
                <Sparkline buckets={buckets} />
            </section>

            <h2>Recent events</h2>
            {events.length === 0 ? (
                <p className="cell-muted">No events recorded yet.</p>
            ) : (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Received at</th>
                                <th>Environment</th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.map((event) => (
                                <tr key={event.id}>
                                    <td>{formatDate(event.receivedAt)}</td>
                                    <td className="cell-muted">{event.env || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <h2>Stack sample</h2>
            <pre className="stack-sample">{group.stackSample}</pre>
        </div>
    );
}

export default GroupDetailPage;