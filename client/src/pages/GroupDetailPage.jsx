import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios.js';
import { useProjectSSE } from '../hooks/useProjectSSE.js';
import { useAuth } from '../context/AuthContext.jsx';

const SEVERITY_LABEL = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
};

function formatDate(iso) {
    return new Date(iso).toLocaleString();
}

function formatTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
    if (isToday) return time;
    const date = d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
    });
    return `${date} ${time}`;
}

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

// Trend status display
function TrendStatus({ trend }) {
    const isInsufficient = !trend || trend.status === 'insufficient_history';
    const currentCount = trend?.currentHourCount || 0;
    const rate = trend?.baselineHourlyRate;
    const rateLabel = Number.isFinite(rate) && rate !== null ? rate.toFixed(1) : null;
    const ratio = rate > 0 ? (currentCount / rate).toFixed(1) : null;

    if (isInsufficient) {
        const isElevated = currentCount >= 5;
        return (
            <div>
                <div className="trend-headline">
                    <span className="trend-big">{currentCount}</span>
                    <span className="trend-unit">events this hour</span>
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                    {isElevated ? (
                        <span className="badge badge-trend-spiking">↑ elevated activity</span>
                    ) : (
                        <span className="badge badge-trend-normal">normal (baseline building)</span>
                    )}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-faint)' }}>
                    Collecting 24h baseline…
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="trend-headline">
                <span className="trend-big">{trend.currentHourCount}</span>
                <span className="trend-unit">events this hour</span>
                {rateLabel !== null && (
                    <span className="trend-baseline">
                        {rateLabel}/hr baseline
                    </span>
                )}
            </div>
            {trend.isSpiking ? (
                <div style={{ marginBottom: '0.5rem' }}>
                    <span className="badge badge-trend-spiking">
                        ↑ {ratio ? `${ratio}× baseline · ` : ''}spiking
                    </span>
                </div>
            ) : (
                <div style={{ marginBottom: '0.5rem' }}>
                    <span className="badge badge-trend-normal">normal</span>
                </div>
            )}
        </div>
    );
}

// 24-hour hourly sparkline chart from events
function buildHourlySparklineBuckets(events) {
    const now = new Date();
    const currentHourStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
    const HOUR_MS = 60 * 60 * 1000;

    const buckets = [];
    for (let i = 24; i >= 0; i--) {
        const h = new Date(currentHourStart.getTime() - i * HOUR_MS);
        buckets.push({
            hour: h,
            label: h.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            count: 0,
        });
    }

    const bucketIndexByTime = new Map(buckets.map((b, idx) => [b.hour.getTime(), idx]));

    events.forEach((event) => {
        const d = new Date(event.receivedAt);
        const hourStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
        const index = bucketIndexByTime.get(hourStart);
        if (index !== undefined) {
            buckets[index].count += 1;
        }
    });

    return buckets;
}

function Sparkline({ buckets }) {
    if (!buckets || buckets.length === 0) {
        return <p className="cell-muted" style={{ fontSize: '0.78rem' }}>No event data to chart.</p>;
    }

    const width = 300;
    const height = 60;
    const maxCount = Math.max(1, ...buckets.map((b) => b.count));
    const stepX = width / (buckets.length - 1);

    const points = buckets
        .map((bucket, index) => {
            const x = index * stepX;
            const y = height - (bucket.count / maxCount) * (height - 14) - 6;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');

    const areaPoints = `0,${height} ${points} ${width},${height}`;

    return (
        <div className="sparkline-wrap" style={{ marginTop: '0.5rem' }}>
            <div className="sparkline-header">
                <span>Peak: <strong>{maxCount}/hr</strong></span>
                <span>Trailing 24h</span>
            </div>
            <svg
                viewBox={`0 0 ${width} ${height}`}
                width="100%"
                height={height}
                role="img"
                aria-label="Event count per hour"
                className="sparkline-svg"
            >
                <defs>
                    <linearGradient id="sparkline-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.0" />
                    </linearGradient>
                </defs>
                <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="var(--color-border-strong)" strokeWidth="1" />
                <polygon points={areaPoints} fill="url(#sparkline-grad)" />
                <polyline points={points} fill="none" stroke="var(--color-accent)" strokeWidth="2" />
            </svg>
            <div className="sparkline-footer">
                <span>{buckets[0].label}</span>
                <span>now</span>
            </div>
        </div>
    );
}

// Remediation checklist
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
                        <span style={{ fontSize: '0.82rem' }}>{step}</span>
                    </label>
                </li>
            ))}
        </ul>
    );
}

function GroupDetailPage() {
    const { id } = useParams();
    const { user, logout } = useAuth();

    const [group, setGroup] = useState(null);
    const [events, setEvents] = useState([]);
    const [trend, setTrend] = useState(null);
    const [environments, setEnvironments] = useState([]);
    const [showRawStack, setShowRawStack] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError('');
        try {
            const res = await api.get(`/groups/${id}`);
            setGroup(res.data.data.group);
            setEvents(res.data.data.events);
            setTrend(res.data.data.trend);
            setEnvironments(res.data.data.environments || []);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load error group.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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

    if (error && !group) {
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

    const aiSummary = group?.aiSummary;
    const buckets = buildHourlySparklineBuckets(events);

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

            {/* Back Link */}
            <Link to={group ? `/projects/${group.projectId}` : '/dashboard'} className="back-link" style={{ marginBottom: '0.75rem' }}>
                ← Back to project
            </Link>

            {/* Error Header */}
            <header className="group-detail-header">
                {loading && !group ? (
                    <>
                        <span className="skeleton" style={{ width: '55%', height: '24px', display: 'block', marginBottom: '0.5rem' }} />
                        <div className="group-meta-bar">
                            <span className="skeleton skeleton-badge" />
                            <span className="skeleton skeleton-badge" />
                            <span className="skeleton skeleton-badge" style={{ width: '65px' }} />
                        </div>
                        <div style={{ marginTop: '0.35rem' }}>
                            <span className="skeleton" style={{ width: '240px', height: '12px' }} />
                        </div>
                    </>
                ) : (
                    <>
                        <h1 className="group-title">{group?.message}</h1>
                        <div className="group-meta-bar">
                            <StatusBadge status={group.status} />
                            <SeverityBadge severity={aiSummary?.severity} />
                            {environments.map((env) => (
                                <span key={env} className="badge badge-env">{env}</span>
                            ))}
                            {group.firstSeenRelease && (
                                <span className="badge badge-release mono">{group.firstSeenRelease}</span>
                            )}
                            <span className={`live-indicator${liveConnected ? ' is-connected' : ''}`}>
                                <span className="live-indicator-dot" />
                                {liveConnected ? 'Live' : 'Connecting…'}
                            </span>
                        </div>
                        <div className="group-timestamps" style={{ marginTop: '0.35rem' }}>
                            <span className="mono" style={{ fontSize: '0.72rem' }}>{group.count}</span> occurrences
                            {' · '}First seen {formatRelativeTime(group.firstSeen)}
                            {' · '}Last seen {formatRelativeTime(group.lastSeen)}
                        </div>
                    </>
                )}
            </header>

            {/* AI Analysis + Trend — 2-column grid, AI visually dominant */}
            <div className="group-detail-grid">
                {/* AI Root Cause — dominant section */}
                <section className="ai-section">
                    <div className="ai-section-header">
                        <h2>AI Root Cause Analysis</h2>
                        {loading && !group ? (
                            <span className="skeleton" style={{ width: '85px', height: '14px' }} />
                        ) : aiSummary ? (
                            <span className="ai-confidence">
                                Confidence <strong>{typeof aiSummary.confidence === 'number' ? `${Math.round(aiSummary.confidence * 100)}%` : '—'}</strong>
                            </span>
                        ) : null}
                    </div>

                    {loading && !group ? (
                        <div>
                            <div className="ai-target-box" style={{ background: 'var(--color-bg)' }}>
                                <span className="skeleton" style={{ width: '65%', height: '14px' }} />
                            </div>
                            <div className="sub-heading">Root Cause</div>
                            <div className="root-cause-text" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <span className="skeleton" style={{ width: '95%', height: '12px' }} />
                                <span className="skeleton" style={{ width: '85%', height: '12px' }} />
                                <span className="skeleton" style={{ width: '60%', height: '12px' }} />
                            </div>
                            <div className="ai-checklist-wrap">
                                <div className="sub-heading">Suggested Remediation</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <span className="skeleton" style={{ width: '100%', height: '30px' }} />
                                    <span className="skeleton" style={{ width: '100%', height: '30px' }} />
                                </div>
                            </div>
                        </div>
                    ) : aiSummary ? (
                        <div>
                            {aiSummary.affectedFile && (
                                <div className="ai-target-box">
                                    <span className="target-label">AFFECTED:</span>
                                    <code className="target-file">{aiSummary.affectedFile}</code>
                                    {aiSummary.affectedFunction && <code className="target-func">&gt; {aiSummary.affectedFunction}()</code>}
                                </div>
                            )}

                            <div className="sub-heading">Root Cause</div>
                            <p className="root-cause-text">{aiSummary.rootCause}</p>

                            {aiSummary.suggestedFix && aiSummary.suggestedFix.length > 0 && (
                                <div className="ai-checklist-wrap">
                                    <div className="sub-heading">Suggested Remediation</div>
                                    <AiChecklist suggestedFix={aiSummary.suggestedFix} />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="ai-loading-skeleton">
                            <span className="live-indicator-dot" style={{ background: 'var(--color-warning)', flexShrink: 0 }} />
                            <p style={{ margin: 0 }}>
                                <strong>Analysis enqueued</strong> — worker is processing stack trace and grounding with code context…
                            </p>
                        </div>
                    )}
                </section>

                {/* Error Rate Trend — compact, secondary */}
                <section className="trend-section">
                    <div className="sub-heading">Error Rate</div>
                    {loading && !group ? (
                        <div>
                            <div className="trend-headline">
                                <span className="skeleton" style={{ width: '50px', height: '26px' }} />
                                <span className="skeleton" style={{ width: '45px', height: '14px' }} />
                            </div>
                            <div className="sparkline-wrap" style={{ marginTop: '0.5rem' }}>
                                <div className="sparkline-header">
                                    <span className="skeleton" style={{ width: '60px', height: '12px' }} />
                                    <span className="skeleton" style={{ width: '65px', height: '12px' }} />
                                </div>
                                <div className="skeleton" style={{ width: '100%', height: '60px', margin: '4px 0' }} />
                                <div className="sparkline-footer">
                                    <span className="skeleton" style={{ width: '45px', height: '12px' }} />
                                    <span className="skeleton" style={{ width: '25px', height: '12px' }} />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <TrendStatus trend={trend} />
                            <Sparkline buckets={buckets} />
                        </>
                    )}
                </section>
            </div>

            {/* Stack Trace */}
            <hr className="section-divider" />
            {loading && !group ? (
                <section className="stack-section">
                    <div className="stack-header">
                        <h2 style={{ margin: 0 }}>Stack Trace</h2>
                    </div>
                    <div className="resolved-stack-wrap">
                        {Array.from({ length: 4 }).map((_, idx) => (
                            <div key={idx} className="resolved-frame" style={{ display: 'flex', gap: '8px', padding: '0.25rem 0' }}>
                                <span className="skeleton" style={{ width: `${25 + (idx * 12) % 20}%`, height: '14px' }} />
                                <span className="skeleton" style={{ width: `${40 + (idx * 9) % 25}%`, height: '14px' }} />
                            </div>
                        ))}
                    </div>
                </section>
            ) : group ? (() => {
                const hasResolvedFrames = group.resolvedStack && group.resolvedStack.some((f) => f.resolved);
                const hasParsedFrames = group.resolvedStack && group.resolvedStack.length > 0;
                return (
                    <section className="stack-section">
                        <div className="stack-header">
                            <h2 style={{ margin: 0 }}>Stack Trace</h2>
                            <div className="stack-toggle">
                                {hasResolvedFrames && (
                                    <span className="badge badge-sourcemap">source mapped</span>
                                )}
                                {hasParsedFrames && (
                                    <>
                                        <button
                                            type="button"
                                            className={`btn-tab ${!showRawStack ? 'active' : ''}`}
                                            onClick={() => setShowRawStack(false)}
                                        >
                                            {hasResolvedFrames ? 'Resolved' : 'Parsed'}
                                        </button>
                                        <button
                                            type="button"
                                            className={`btn-tab ${showRawStack ? 'active' : ''}`}
                                            onClick={() => setShowRawStack(true)}
                                        >
                                            Raw
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {!showRawStack && hasParsedFrames ? (
                            <div className="resolved-stack-wrap">
                                {group.resolvedStack.map((frame, idx) => (
                                    <div key={idx} className={`resolved-frame ${frame.resolved ? 'is-resolved' : 'is-unresolved'}`}>
                                        {frame.resolved ? (
                                            <>
                                                <span className="frame-func">at {frame.originalFunctionName || 'anonymous'}</span>
                                                <span className="frame-loc">({frame.originalFile}:{frame.originalLine}:{frame.originalColumn})</span>
                                                <span className="frame-raw-muted">← {frame.file}:{frame.line}:{frame.column}</span>
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
                            <pre className="stack-sample mono">{group.stackSample || 'No stack trace available.'}</pre>
                        )}
                    </section>
                );
            })() : null}

            {/* Recent Events — compact timeline */}
            <hr className="section-divider" />
            <div className="section-header-inline">
                <h2 style={{ fontSize: '0.85rem' }}>Recent Events</h2>
                {loading && events.length === 0 ? (
                    <span className="skeleton" style={{ width: '45px', height: '14px' }} />
                ) : (
                    <span className="mono-count">{events.length} fetched</span>
                )}
            </div>

            {loading && events.length === 0 ? (
                <div className="events-timeline" aria-busy="true" aria-label="Loading events">
                    {Array.from({ length: 4 }).map((_, idx) => (
                        <div key={idx} className="event-row">
                            <span className="skeleton" style={{ width: '70px', height: '14px' }} />
                            <span className="skeleton" style={{ width: '60px', height: '14px' }} />
                            <span className="skeleton" style={{ width: '50px', height: '14px' }} />
                        </div>
                    ))}
                </div>
            ) : events.length === 0 ? (
                <p className="cell-muted" style={{ fontSize: '0.78rem' }}>No events recorded yet.</p>
            ) : (
                <div className="events-timeline events-timeline-scroll">
                    {events.map((event) => (
                        <div key={event.id} className="event-row">
                            <span className="event-timestamp">{formatTime(event.receivedAt)}</span>
                            <span className="event-env">{event.env || 'simulated'}</span>
                            {event.release ? (
                                <span className="event-release">{event.release}</span>
                            ) : (
                                <span className="cell-muted" style={{ fontSize: '0.72rem' }}>—</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default GroupDetailPage;