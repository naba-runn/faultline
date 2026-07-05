import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios.js';

// Severity badge colors are illustrative-only inline styles, not a
// design-system choice — deliberately minimal per Task 17's scope
// (list views only; polish is Milestone 5's job, not this task's).
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

// Project detail + error group table (Task 17), plus status updates
// (Task 18's PATCH /api/groups/:id/status). Task 19 links each row's
// message to the new per-group ErrorGroupDetail page (AI panel, event
// list, sparkline) at /groups/:id.
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

    const fetchData = useCallback(async () => {
        setLoading(true);
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
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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

    if (loading) {
        return <p>Loading project...</p>;
    }

    if (error) {
        return (
            <div>
                <p role="alert">{error}</p>
                <Link to="/dashboard">Back to dashboard</Link>
            </div>
        );
    }

    return (
        <div>
            <p>
                <Link to="/dashboard">Back to dashboard</Link>
            </p>
            <h1>{project.name}</h1>
            {project.githubRepo && <p>Repo: {project.githubRepo}</p>}

            <h2>Error groups</h2>
            {statusError && <p role="alert">{statusError}</p>}
            {groups.length === 0 ? (
                <p>No errors reported yet for this project.</p>
            ) : (
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
                                <td>
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
                                    {group.aiSummary?.severity
                                        ? SEVERITY_LABEL[group.aiSummary.severity] || group.aiSummary.severity
                                        : '—'}
                                </td>
                                <td>{group.count}</td>
                                <td>{formatDate(group.lastSeen)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

export default ProjectDetailPage;