import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, AlertCircle, Sparkles } from 'lucide-react';
import api from '../api/axios.js';
import { useProjectSSE } from '../hooks/useProjectSSE.js';
import AppLayout from '../components/AppLayout.jsx';
import { formatRelativeTime } from '../utils/formatters.js';
import { SEVERITY_LABEL, INCIDENT_STATUS_OPTIONS } from '../utils/uiConstants.js';

// Task 41.5: per-incident detail — timeline, affected groups, AI
// hypothesis, status control. Pushed live over the existing SSE
// channel (Task 26), same mechanism GroupDetailPage/ProjectDetailPage
// already use — no second real-time system introduced for this.
export default function IncidentDetailPage() {
    const { id } = useParams();

    const [incident, setIncident] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [statusError, setStatusError] = useState('');
    const [updatingStatus, setUpdatingStatus] = useState(false);

    const fetchIncident = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError('');
        try {
            const res = await api.get(`/incidents/${id}`);
            setIncident(res.data?.data || null);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load incident.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchIncident();
    }, [fetchIncident]);

    // The SSE payload only carries { incidentId } (see
    // incidentService.js/worker.js's publish calls), not the full
    // updated document — a silent refetch on a matching id is the
    // simplest correct handling, same "server signals, client
    // refetches" pattern GroupDetailPage uses for its own SSE events.
    const handleSSEMessage = useCallback(
        (type, payload) => {
            if (
                (type === 'incident_updated' || type === 'incident_created') &&
                String(payload?.incidentId) === String(id)
            ) {
                fetchIncident(true);
            }
        },
        [id, fetchIncident]
    );

    const { connected } = useProjectSSE(incident?.projectId, handleSSEMessage);

    const handleStatusChange = async (newStatus) => {
        setStatusError('');
        setUpdatingStatus(true);
        try {
            const res = await api.patch(`/incidents/${id}/status`, { status: newStatus });
            setIncident((prev) => ({ ...prev, ...res.data.data.incident }));
        } catch (err) {
            setStatusError(err.response?.data?.error || 'Failed to update status.');
        } finally {
            setUpdatingStatus(false);
        }
    };

    if (loading) {
        return (
            <AppLayout currentProjectId={incident?.projectId}>
                <div className="page-loading-state">
                    <div className="loading-spinner" />
                </div>
            </AppLayout>
        );
    }

    if (error || !incident) {
        return (
            <AppLayout>
                <div className="empty-state-card" style={{ marginTop: '2rem' }}>
                    <AlertCircle size={24} style={{ color: 'var(--critical)', marginBottom: '0.75rem' }} />
                    <h3 className="empty-state-title">Incident not found</h3>
                    <p className="empty-state-desc">{error || 'This incident does not exist.'}</p>
                    <Link to="/dashboard" className="btn btn-secondary btn-sm">
                        Return to dashboard
                    </Link>
                </div>
            </AppLayout>
        );
    }

    const sev = incident.severity;

    return (
        <AppLayout currentProjectId={incident.projectId}>
            <div style={{ marginBottom: '1rem' }}>
                <Link
                    to={`/projects/${incident.projectId}`}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                        fontWeight: 500,
                    }}
                >
                    <ArrowLeft size={14} /> Back to project
                </Link>
            </div>

            <div style={{ marginBottom: '1.75rem' }}>
                <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.35rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word', lineHeight: 1.3 }}>
                    {incident.title}
                </h1>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
                    <select
                        value={incident.status}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        disabled={updatingStatus}
                        className={`select-status badge-status-${incident.status}`}
                        aria-label="Change incident status"
                    >
                        {INCIDENT_STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                                {opt.toUpperCase()}
                            </option>
                        ))}
                    </select>

                    {sev && (
                        <span className={`badge badge-severity-${sev}`}>
                            {SEVERITY_LABEL[sev] || sev}
                        </span>
                    )}

                    <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {incident.triggeredBy?.type === 'deployment' ? 'Triggered by deployment' : incident.triggeredBy?.type === 'spike' ? 'Triggered by spike' : 'Manually opened'}
                    </span>

                    <span className="system-status-badge">
                        <span className="system-status-dot" />
                        <span>{connected ? 'Live' : 'Connecting…'}</span>
                    </span>
                </div>

                {statusError && (
                    <p style={{ color: 'var(--critical)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{statusError}</p>
                )}
            </div>

            <section className="dash-section">
                <div className="dash-section-header">
                    <h2 className="dash-section-title">
                        <Sparkles size={15} style={{ marginRight: '0.35rem', verticalAlign: '-2px' }} />
                        AI Diagnosis
                    </h2>
                </div>
                {incident.aiSummary ? (
                    <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{incident.aiSummary}</p>
                ) : (
                    <div className="empty-state-compact">
                        <span className="empty-state-compact-title">Diagnosis pending</span>
                        <span className="empty-state-compact-desc">AI diagnosis is queued and will appear here shortly.</span>
                    </div>
                )}
            </section>

            <section className="dash-section">
                <div className="dash-section-header">
                    <h2 className="dash-section-title">
                        Affected Groups <span className="dash-section-meta">{incident.affectedGroups.length}</span>
                    </h2>
                </div>
                {incident.affectedGroups.length === 0 ? (
                    <div className="empty-state-compact">
                        <span className="empty-state-compact-title">No affected groups</span>
                    </div>
                ) : (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Message</th>
                                    <th style={{ width: '85px' }}>Severity</th>
                                    <th style={{ width: '90px' }}>Status</th>
                                    <th style={{ width: '75px', textAlign: 'right' }}>Events</th>
                                    <th style={{ width: '100px' }}>Last Seen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {incident.affectedGroups.map((g) => (
                                    <tr key={g.id} className="row-hoverable">
                                        <td>
                                            <Link to={`/groups/${g.id}`} className="issue-title-link">
                                                {g.message}
                                            </Link>
                                        </td>
                                        <td>
                                            {g.severity ? (
                                                <span className={`badge badge-severity-${g.severity}`}>
                                                    {SEVERITY_LABEL[g.severity] || g.severity}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`badge badge-status-${g.status}`}>{g.status}</span>
                                        </td>
                                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{g.count}</td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                            {formatRelativeTime(g.lastSeen)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="dash-section">
                <div className="dash-section-header">
                    <h2 className="dash-section-title">
                        Timeline <span className="dash-section-meta">{incident.timeline.length}</span>
                    </h2>
                </div>
                <div className="spikes-list">
                    {incident.timeline.map((entry, i) => (
                        <div key={i} className="spike-row spike-row--wrap">
                            <div className="spike-left">
                                <span className="spike-tag">{entry.type.replace(/_/g, ' ')}</span>
                                <span className="spike-title">{entry.message}</span>
                            </div>
                            <span className="spike-meta">{formatRelativeTime(entry.timestamp)}</span>
                        </div>
                    ))}
                </div>
            </section>
        </AppLayout>
    );
}
