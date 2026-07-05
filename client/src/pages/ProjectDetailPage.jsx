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

function formatDate(iso) {
    return new Date(iso).toLocaleString();
}

// Project detail + error group table (Task 17). Deliberately does NOT
// link each row to a per-group detail page yet — ErrorGroupDetail
// (AI panel, event list, sparkline) is Task 19, and status changes are
// Task 18's PATCH /api/groups/:id/status. This page only lists.
function ProjectDetailPage() {
    const { id } = useParams();

    const [project, setProject] = useState(null);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

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
                                <td>{group.message}</td>
                                <td>{group.status}</td>
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