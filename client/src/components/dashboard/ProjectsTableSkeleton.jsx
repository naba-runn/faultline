export default function ProjectsTableSkeleton({ count = 3 }) {
    return (
        <div className="table-wrap" aria-busy="true" aria-label="Loading projects">
            <table>
                <thead>
                    <tr>
                        <th>Project</th>
                        <th>Repository</th>
                        <th>Created</th>
                        <th>Integration</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: count }).map((_, i) => (
                        <tr key={i}>
                            <td>
                                <span className="skeleton" style={{ width: `${90 + (i * 20) % 40}px`, height: '14px' }} />
                            </td>
                            <td>
                                <span className="skeleton" style={{ width: '110px', height: '12px' }} />
                            </td>
                            <td>
                                <span className="skeleton" style={{ width: '70px', height: '12px' }} />
                            </td>
                            <td>
                                <span className="skeleton" style={{ width: '50px', height: '20px' }} />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                                <span className="skeleton" style={{ width: '80px', height: '22px' }} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

