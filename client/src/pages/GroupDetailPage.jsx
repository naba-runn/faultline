import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    ArrowLeft,
    Sparkles,
    Copy,
    Check,
    Terminal,
    Clock,
    Layers,
    AlertCircle,
    CheckCircle2,
    Activity
} from 'lucide-react';
import api from '../api/axios.js';
import { useProjectSSE } from '../hooks/useProjectSSE.js';
import AppLayout from '../components/AppLayout.jsx';
import { formatRelativeTime, formatTime } from '../utils/formatters.js';
import Sparkline, { buildHourlySparklineBuckets } from '../components/group-detail/GroupSparkline.jsx';
import { SEVERITY_LABEL, STATUS_OPTIONS } from '../utils/uiConstants.js';

// 24-hour hourly sparkline chart from events
export default function GroupDetailPage() {
    const { id } = useParams();

    const [group, setGroup] = useState(null);
    const [events, setEvents] = useState([]);
    const [trend, setTrend] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [statusError, setStatusError] = useState('');
    const [updatingStatus, setUpdatingStatus] = useState(false);
    const [stackView, setStackView] = useState('parsed'); // 'parsed' | 'raw'
    const [copied, setCopied] = useState(false);

    const [checkedTasks, setCheckedTasks] = useState({});

    const fetchGroup = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError('');
        try {
            const res = await api.get(`/groups/${id}`);
            const data = res.data?.data || res.data || {};
            setGroup(data.group || null);
            setEvents(data.events || []);
            setTrend(data.trend || null);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load error group.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchGroup();
    }, [fetchGroup]);

    // Live SSE updates for this project's errors
    const handleSSEMessage = useCallback(
        (data) => {
            if (data.type === 'new_event' || data.type === 'group_updated' || data.type === 'heartbeat') {
                fetchGroup(true);
            }
        },
        [fetchGroup]
    );

    const { status: sseStatus } = useProjectSSE(group?.projectId, handleSSEMessage);

    const handleStatusChange = async (newStatus) => {
        setStatusError('');
        setUpdatingStatus(true);
        try {
            const res = await api.patch(`/groups/${id}/status`, { status: newStatus });
            setGroup(res.data.data.group);
        } catch (err) {
            setStatusError(err.response?.data?.error || 'Failed to update status.');
        } finally {
            setUpdatingStatus(false);
        }
    };

    const handleCopyStack = () => {
        const raw = group?.rawStackTrace || group?.stackSample || (group?.resolvedStack || [])
            .map((f) => {
                const fn = (f.resolved ? f.originalFunctionName : f.functionName) || 'unknown';
                const file = (f.resolved ? f.originalFile : f.file) || 'unknown';
                const line = (f.resolved ? f.originalLine : f.line) ?? '?';
                const col = (f.resolved ? f.originalColumn : f.column) ?? '?';
                return `    at ${fn} (${file}:${line}:${col})`;
            })
            .join('\n');
        if (!raw) return;
        navigator.clipboard.writeText(raw);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const toggleTask = (idx) => {
        setCheckedTasks((prev) => ({ ...prev, [idx]: !prev[idx] }));
    };

    const sparklineBuckets = buildHourlySparklineBuckets(events);

    if (loading) {
        return (
            <AppLayout currentProjectId={group?.projectId}>
                <div className="page-loading-state">
                    <div className="loading-spinner" />
                </div>
            </AppLayout>
        );
    }

    if (error || !group) {
        return (
            <AppLayout>
                <div className="empty-state-card" style={{ marginTop: '2rem' }}>
                    <AlertCircle size={24} style={{ color: 'var(--critical)', marginBottom: '0.75rem' }} />
                    <h3 className="empty-state-title">Error group not found</h3>
                    <p className="empty-state-desc">{error || 'This error group does not exist.'}</p>
                    <Link to="/dashboard" className="btn btn-secondary btn-sm">
                        Return to dashboard
                    </Link>
                </div>
            </AppLayout>
        );
    }

    const sev = group.severity || group.aiSummary?.severity || 'medium';
    
    // Support resolved source-mapped stack, fallback to parsing raw stackSample for older errors.
    // sourceMapService.resolveStack returns { file, line, column, functionName, resolved,
    // originalFile, originalLine, originalColumn, originalFunctionName } — normalize to the
    // { functionName, file, lineNumber, columnNumber, resolved } shape this view renders,
    // preferring the source-mapped original location when a frame was actually resolved.
    let parsedStack = Array.isArray(group.resolvedStack) && group.resolvedStack.length > 0
        ? group.resolvedStack.map((f) => ({
            functionName: f.resolved ? (f.originalFunctionName || f.functionName) : f.functionName,
            file: f.resolved ? f.originalFile : f.file,
            lineNumber: f.resolved ? f.originalLine : f.line,
            columnNumber: f.resolved ? f.originalColumn : f.column,
            resolved: Boolean(f.resolved),
        }))
        : [];
    if (parsedStack.length === 0 && (group.stackSample || group.rawStackTrace)) {
        const raw = group.stackSample || group.rawStackTrace || '';
        const lines = raw.split('\n');
        parsedStack = lines
            .filter((l) => l.trim().startsWith('at '))
            .map((l) => {
                const match = l.trim().match(/^at\s+(?:(.+?)\s+\((.+?):(\d+):(\d+)\)|(.+?):(\d+):(\d+)|(.+))$/);
                if (!match) return { functionName: l.trim().replace(/^at\s+/, ''), file: '', lineNumber: '', columnNumber: '' };
                if (match[1]) return { functionName: match[1], file: match[2], lineNumber: match[3], columnNumber: match[4] };
                if (match[5]) return { functionName: '<anonymous>', file: match[5], lineNumber: match[6], columnNumber: match[7] };
                return { functionName: match[8] || '', file: '', lineNumber: '', columnNumber: '' };
            });
    }

    const hasAiSummary = Boolean(group.aiSummary && group.aiSummary.rootCause);
    
    // Normalize suggested remediation checklist (can be array or newline-separated string)
    const remediationList = Array.isArray(group.aiSummary?.suggestedFix)
        ? group.aiSummary.suggestedFix
        : typeof group.aiSummary?.suggestedFix === 'string'
            ? group.aiSummary.suggestedFix.split('\n').filter(Boolean)
            : [];

    return (
        <AppLayout currentProjectId={group.projectId}>
            {/* Back link */}
            <div style={{ marginBottom: '1rem' }}>
                <Link
                    to={`/projects/${group.projectId}`}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                        fontWeight: 500
                    }}
                >
                    <ArrowLeft size={14} /> Back to project
                </Link>
            </div>

            {/* Error Identity Header */}
            <div style={{ marginBottom: '1.75rem' }}>
                <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.35rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word', lineHeight: 1.3 }}>
                    {group.message}
                </h1>

                {/* Metadata badges row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
                    <select
                        value={group.status}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        disabled={updatingStatus}
                        className={`select-status badge-status-${group.status}`}
                        aria-label="Change incident status"
                    >
                        {STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                                {opt.toUpperCase()}
                            </option>
                        ))}
                    </select>

                    <span className={`badge badge-severity-${sev}`}>
                        {SEVERITY_LABEL[sev] || sev}
                    </span>

                    {events[0]?.env && (
                        <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                            {events[0].env}
                        </span>
                    )}

                    {group.firstSeenRelease && (
                        <span className="badge-release">
                            {group.firstSeenRelease}
                        </span>
                    )}

                    <span className="system-status-badge">
                        <span className="system-status-dot" />
                        <span>Live</span>
                    </span>
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    {group.count} {group.count === 1 ? 'occurrence' : 'occurrences'} · First seen {formatRelativeTime(group.firstSeen)} · Last seen {formatRelativeTime(group.lastSeen)}
                </div>
            </div>

            {/* Main Content Grid: Left Column (AI + Stack + Events), Right Column (Telemetry & Sparkline) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '1.75rem', alignItems: 'start' }}>
                
                {/* Left Column */}
                <div>
                    {/* AI Root Cause Analysis (Feature Surface) */}
                    <div className="ai-panel">
                        <div className="ai-panel-header">
                            <div className="ai-panel-title-wrap">
                                <Sparkles size={16} style={{ color: 'var(--accent)' }} />
                                <span className="ai-panel-title">AI Root Cause Analysis</span>
                            </div>
                            {group.aiSummary?.confidence && (
                                <span className="ai-confidence-pill">
                                    Confidence {Math.round(group.aiSummary.confidence * 100)}%
                                </span>
                            )}
                        </div>

                        <div className="ai-panel-body">
                            {!hasAiSummary ? (
                                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                    Analysis enqueued — worker is processing stack trace and grounding with code context…
                                </div>
                            ) : (
                                <>
                                    {/* Affected file and function */}
                                    {group.aiSummary.affectedFile && (
                                        <div className="ai-target-box">
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, display: 'block', marginBottom: '2px' }}>
                                                AFFECTED TARGET
                                            </span>
                                            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{group.aiSummary.affectedFile}</span>
                                            {group.aiSummary.affectedFunction && (
                                                <span style={{ color: 'var(--text-secondary)' }}> &gt; {group.aiSummary.affectedFunction}()</span>
                                            )}
                                        </div>
                                    )}

                                    {/* Root Cause */}
                                    <div>
                                        <div className="ai-section-label">Root Cause</div>
                                        <div className="ai-section-content">{group.aiSummary.rootCause}</div>
                                    </div>

                                    {/* Suggested Remediation Checklist */}
                                    {remediationList.length > 0 && (
                                        <div>
                                            <div className="ai-section-label">Suggested Remediation</div>
                                            <div className="ai-remediation-list">
                                                {remediationList.map((line, idx) => (
                                                    <label key={idx} className="ai-remediation-item" style={{ cursor: 'pointer' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={Boolean(checkedTasks[idx])}
                                                            onChange={() => toggleTask(idx)}
                                                            className="ai-remediation-checkbox"
                                                        />
                                                        <span style={{ textDecoration: checkedTasks[idx] ? 'line-through' : 'none', color: checkedTasks[idx] ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                                                            {line.replace(/^[-*•\d.]+\s*/, '')}
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Developer Stack Trace Console */}
                    <div className="stack-console">
                        <div className="stack-console-header">
                            <span className="stack-console-title">Stack Trace</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div className="stack-toggle-group">
                                    <button
                                        type="button"
                                        className={`stack-toggle-btn ${stackView === 'parsed' ? 'active' : ''}`}
                                        onClick={() => setStackView('parsed')}
                                    >
                                        Parsed
                                    </button>
                                    <button
                                        type="button"
                                        className={`stack-toggle-btn ${stackView === 'raw' ? 'active' : ''}`}
                                        onClick={() => setStackView('raw')}
                                    >
                                        Raw
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCopyStack}
                                    style={{ background: 'transparent', border: 'none', color: '#9DA39D', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem' }}
                                    title="Copy stack trace"
                                >
                                    {copied ? <Check size={13} style={{ color: 'var(--success)' }} /> : <Copy size={13} />}
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                        </div>

                        {stackView === 'parsed' && parsedStack.length > 0 ? (
                            <div className="stack-frames-list">
                                {parsedStack.map((frame, i) => (
                                    <div key={i} className="stack-frame-row">
                                        <span style={{ color: '#5C6370', fontSize: '0.72rem', minWidth: '20px' }}>{i + 1}</span>
                                        <span className="stack-frame-fn">at {frame.functionName || '<anonymous>'}</span>
                                        <span className="stack-frame-file">
                                            ({frame.file || 'unknown'}:{frame.lineNumber ?? '?'}:{frame.columnNumber ?? '?'})
                                        </span>
                                        {frame.resolved && (
                                            <span
                                                title="Resolved via uploaded source map"
                                                style={{ fontSize: '0.65rem', color: 'var(--accent, #61AFEF)', marginLeft: '0.35rem' }}
                                            >
                                                source-mapped
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <pre className="stack-raw-pre">
                                {group.stackSample || group.rawStackTrace || 'No raw stack trace available.'}
                            </pre>
                        )}
                    </div>

                    {/* Chronological Events Stream */}
                    <section className="dash-section">
                        <div className="dash-section-header">
                            <h2 className="dash-section-title">
                                Recent Events <span className="dash-section-meta">{events.length} fetched</span>
                            </h2>
                        </div>

                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ width: '90px' }}>Time</th>
                                        <th style={{ width: '100px' }}>Environment</th>
                                        <th style={{ width: '120px' }}>Release</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {events.slice(0, 10).map((evt) => (
                                        <tr key={evt.id || evt._id}>
                                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                {formatTime(evt.receivedAt)}
                                            </td>
                                            <td>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    {evt.env || evt.environment || 'production'}
                                                </span>
                                            </td>
                                            <td>
                                                {evt.release ? (
                                                    <span className="badge-release">{evt.release}</span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                                                )}
                                            </td>
                                            <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                                {evt.id || evt._id}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>

                {/* Right Column: Error Rate & Telemetry */}
                <div>
                    <div className="chart-surface" style={{ padding: '1.15rem' }}>
                        <div className="ai-section-label" style={{ marginBottom: '0.4rem' }}>Error Rate</div>
                        
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', marginBottom: '0.35rem' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.45rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {trend?.currentHourCount ?? events.length}
                            </span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>events this hour</span>
                        </div>

                        <div style={{ marginBottom: '0.85rem' }}>
                            {trend?.isSpiking ? (
                                <span className="badge badge-severity-critical">
                                    ↑ Spiking ({trend.baselineHourlyRate ? `${(trend.currentHourCount / trend.baselineHourlyRate).toFixed(1)}× baseline` : 'elevated'})
                                </span>
                            ) : (
                                <span className="badge" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                                    Normal (baseline active)
                                </span>
                            )}
                        </div>

                        {/* 24h Hourly Sparkline */}
                        <Sparkline buckets={sparklineBuckets} />
                    </div>
                </div>

            </div>
        </AppLayout>
    );
}