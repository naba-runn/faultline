import { useState, useEffect, useCallback, useRef } from 'react';
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

// Task 29.2: surfaces trendService's computed current-vs-baseline
// comparison (via GET /api/groups/:id's new `trend` field), not raw
// counts alone — the point of Task 29 per TASKS.md's own wording.
// `trend` can be undefined only for a payload from before this field
// existed (stale cached response, if any) — treated the same as
// 'insufficient_history' rather than crashing on a missing field.
function TrendBadge({ trend }) {
    if (!trend || trend.status === 'insufficient_history') {
        return (
            <div className="trend-stat-row">
                <span className="badge badge-trend-insufficient">Insufficient history</span>
                <span className="cell-muted" style={{ fontSize: '0.78rem' }}>Collecting 24h baseline...</span>
            </div>
        );
    }

    const rate = trend.baselineHourlyRate;
    const rateLabel = Number.isFinite(rate) ? rate.toFixed(1) : '0.0';

    if (trend.isSpiking) {
        return (
            <div className="trend-stat-row">
                <span className="badge badge-trend-spiking">
                    ⚡ SPIKING — {trend.currentHourCount} events this hour
                </span>
                <span className="cell-muted mono" style={{ fontSize: '0.78rem' }}>
                    vs {rateLabel}/hr baseline
                </span>
            </div>
        );
    }

    return (
        <div className="trend-stat-row">
            <span className="badge badge-trend-normal">
                NORMAL — {trend.currentHourCount} events this hour
            </span>
            <span className="cell-muted mono" style={{ fontSize: '0.78rem' }}>
                vs {rateLabel}/hr baseline
            </span>
        </div>
    );
}

// Buckets the (already-capped, most-recent-first) events by calendar
// day, ascending, for the sparkline.
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

function Sparkline({ buckets }) {
    if (buckets.length === 0) {
        return <p className="cell-muted">No event data to chart yet.</p>;
    }

    if (buckets.length === 1) {
        return (
            <div className="sparkline-single-day">
                <span className="stat-value" style={{ fontSize: '1.4rem' }}>{buckets[0].count}</span>
                <span className="cell-muted" style={{ fontSize: '0.8rem' }}>
                    event{buckets[0].count === 1 ? '' : 's'} recorded on {buckets[0].day}
                </span>
            </div>
        );
    }

    const width = 340;
    const height = 90;
    const maxCount = Math.max(...buckets.map((bucket) => bucket.count));
    const stepX = width / (buckets.length - 1);

    const points = buckets
        .map((bucket, index) => {
            const x = index * stepX;
            const y = height - (bucket.count / maxCount) * (height - 18) - 8;
            return `${x},${y}`;
        })
        .join(' ');

    const areaPoints = `0,${height} ${points} ${width},${height}`;

    return (
        <div className="sparkline-enhanced-wrap">
            <div className="sparkline-header-meta mono">
                <span>Peak: <strong>{maxCount} events/day</strong></span>
                <span>Range: <strong>{buckets.length} days</strong></span>
            </div>
            <svg
                viewBox={`0 0 ${width} ${height}`}
                width="100%"
                height={height}
                role="img"
                aria-label="Event count per day"
                className="sparkline-svg"
            >
                <defs>
                    <linearGradient id="sparkline-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.0" />
                    </linearGradient>
                </defs>
                <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="var(--color-border)" strokeWidth="1" />
                <polygon points={areaPoints} fill="url(#sparkline-grad)" />
                <polyline points={points} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" />
            </svg>
            <div className="sparkline-footer-meta mono cell-muted">
                <span>{buckets[0].day}</span>
                <span>{buckets[buckets.length - 1].day}</span>
            </div>
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
                            id={`fix-step-${index}`}
                            name={`fix-step-${index}`}
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
    const [trend, setTrend] = useState(null);
    // Task 31: deduplicated env values across all fetched events,
    // computed server-side (e.g. ["production", "staging"]).
    const [environments, setEnvironments] = useState([]);
    // Task 32: toggle between resolved source stack trace and raw minified stack
    const [showRawStack, setShowRawStack] = useState(false);
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
            setTrend(res.data.data.trend);
            setEnvironments(res.data.data.environments || []);
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
    // project doesn't trigger a pointless refetch here. Debounced for
    // the same reason as ProjectDetailPage.jsx — see that file's
    // comment and docs/DECISIONS.md's "Redundant self-triggered
    // refetches" entry.
    const refetchDebounceRef = useRef(null);
    const { connected: liveConnected } = useProjectSSE(group?.projectId, (type, payload) => {
        if (payload?.errorGroupId === id) {
            if (refetchDebounceRef.current) clearTimeout(refetchDebounceRef.current);
            refetchDebounceRef.current = setTimeout(() => {
                fetchData(true);
            }, 400);
        }
    });

    useEffect(() => {
        return () => {
            if (refetchDebounceRef.current) clearTimeout(refetchDebounceRef.current);
        };
    }, []);

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

            <header className="group-detail-header">
                <div className="group-header-top">
                    <h1 className="mono group-title">{group.message}</h1>
                </div>
                <div className="group-meta-bar">
                    <StatusBadge status={group.status} />
                    <SeverityBadge severity={aiSummary?.severity} />
                    <span className="badge badge-env">Seen {group.count} time{group.count === 1 ? '' : 's'}</span>
                    {group.firstSeenRelease && (
                        <span className="badge badge-release">
                            introduced in <span className="mono">{group.firstSeenRelease}</span>
                        </span>
                    )}
                    {environments.map((env) => (
                        <span key={env} className="badge badge-env">{env}</span>
                    ))}
                    <span className={`live-indicator${liveConnected ? ' is-connected' : ''}`}>
                        <span className="live-indicator-dot" />
                        {liveConnected ? 'Live' : 'Connecting…'}
                    </span>
                </div>
                <div className="group-timestamps cell-muted mono" style={{ fontSize: '0.8rem', marginTop: '0.6rem' }}>
                    <span>First seen: {formatDate(group.firstSeen)}</span>
                    <span style={{ margin: '0 0.5rem' }}>·</span>
                    <span>Last seen: {formatDate(group.lastSeen)}</span>
                </div>
            </header>

            {/* 2-Column Top Viewport Grid for AI Intelligence & Event Trend */}
            <div className="group-detail-top-grid">
                {/* AI Analysis Hero Section */}
                <section className="card card-ai-hero" style={{ margin: 0 }}>
                    <div className="card-header-bar">
                        <h2>🧠 AI Root-Cause Intelligence</h2>
                        {aiSummary && (
                            <div className="ai-confidence-pill mono">
                                <span>Confidence: <strong>{typeof aiSummary.confidence === 'number' ? `${Math.round(aiSummary.confidence * 100)}%` : '—'}</strong></span>
                            </div>
                        )}
                    </div>

                    {aiSummary ? (
                        <div className="ai-content">
                            {aiSummary.affectedFile && (
                                <div className="ai-target-box mono">
                                    <span className="target-label">GROUNDED CODE TARGET:</span>
                                    <span className="target-file">{aiSummary.affectedFile}</span>
                                    {aiSummary.affectedFunction && <span className="target-func">({aiSummary.affectedFunction})</span>}
                                </div>
                            )}
                            
                            <div className="ai-root-cause">
                                <h3 className="sub-heading">Root Cause Summary</h3>
                                <p className="root-cause-text">{aiSummary.rootCause}</p>
                            </div>

                            {aiSummary.suggestedFix && aiSummary.suggestedFix.length > 0 && (
                                <div className="ai-checklist-wrap" style={{ marginTop: '1.25rem' }}>
                                    <h3 className="sub-heading">Suggested Remediation Checklist</h3>
                                    <AiChecklist suggestedFix={aiSummary.suggestedFix} />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="ai-loading-skeleton">
                            <span className="live-indicator-dot" style={{ background: 'var(--color-warning)' }} />
                            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                                <strong>AI Analysis Enqueued</strong> — Background worker process is analyzing stack trace and grounding with GitHub code context...
                            </p>
                        </div>
                    )}
                </section>

                {/* Activity & Trend Section */}
                <section className="card" style={{ margin: 0 }}>
                    <div className="card-header-bar">
                        <h2>📈 Event Volume & Trend</h2>
                        <TrendBadge trend={trend} />
                    </div>
                    <p className="cell-muted" style={{ fontSize: '0.82rem', marginBottom: '1rem' }}>
                        Trailing 24-hour event frequency evaluation — showing last {events.length} occurrence{events.length === 1 ? '' : 's'} fetched.
                    </p>
                    <Sparkline buckets={buckets} />
                </section>
            </div>

            {/* Stack Trace Section */}
            {(() => {
                const hasResolvedFrames = group.resolvedStack && group.resolvedStack.some((f) => f.resolved);
                return (
                    <section className="card stack-card">
                        <div className="stack-header">
                            <h2>Stack Trace</h2>
                            {hasResolvedFrames && (
                                <div className="stack-toggle">
                                    <span className="badge badge-sourcemap">Source map resolved</span>
                                    <button
                                        type="button"
                                        className={`btn-tab ${!showRawStack ? 'active' : ''}`}
                                        onClick={() => setShowRawStack(false)}
                                    >
                                        Resolved source
                                    </button>
                                    <button
                                        type="button"
                                        className={`btn-tab ${showRawStack ? 'active' : ''}`}
                                        onClick={() => setShowRawStack(true)}
                                    >
                                        Raw stack
                                    </button>
                                </div>
                            )}
                        </div>

                        {!showRawStack && hasResolvedFrames ? (
                            <div className="resolved-stack-wrap">
                                {group.resolvedStack.map((frame, idx) => (
                                    <div key={idx} className={`resolved-frame ${frame.resolved ? 'is-resolved' : 'is-unresolved'}`}>
                                        {frame.resolved ? (
                                            <>
                                                <span className="frame-func">at {frame.originalFunctionName || 'anonymous'}</span>
                                                <span className="frame-loc">({frame.originalFile}:{frame.originalLine}:{frame.originalColumn})</span>
                                                <span className="frame-raw-muted">mapped from {frame.file}:{frame.line}:{frame.column}</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="frame-func">at {frame.functionName || 'anonymous'}</span>
                                                <span className="frame-loc">({frame.file}:{frame.line}:{frame.column})</span>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <pre className="stack-sample mono">{group.stackSample}</pre>
                        )}
                    </section>
                );
            })()}

            {/* Recent Events Table */}
            <div className="section-header-inline" style={{ marginTop: '2.25rem' }}>
                <h2>Recent Incident Occurrences</h2>
                <span className="mono-count">{events.length} fetched</span>
            </div>

            {events.length === 0 ? (
                <p className="cell-muted">No events recorded yet.</p>
            ) : (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>RECEIVED AT</th>
                                <th>ENVIRONMENT</th>
                                <th>RELEASE BUILD</th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.map((event) => (
                                <tr key={event.id} className="row-hoverable">
                                    <td className="mono" style={{ fontSize: '0.85rem' }}>{formatDate(event.receivedAt)}</td>
                                    <td>
                                        <span className="badge badge-env">{event.env || 'simulated'}</span>
                                    </td>
                                    <td className="mono">
                                        {event.release ? (
                                            <span className="badge badge-release">{event.release}</span>
                                        ) : (
                                            <span className="cell-muted">—</span>
                                        )}
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

export default GroupDetailPage;