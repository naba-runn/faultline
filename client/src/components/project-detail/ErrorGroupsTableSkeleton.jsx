export default function ErrorGroupsTableSkeleton({ count = 4 }) {
    return (
        <div className="table-wrap" aria-busy="true" aria-label="Loading error groups">
            <table>
                <thead>
                    <tr>
                        <th style={{ width: '85px' }}>Severity</th>
                        <th>Issue</th>
                        <th style={{ width: '120px' }}>Release</th>
                        <th style={{ width: '85px', textAlign: 'right' }}>Events</th>
                        <th style={{ width: '120px' }}>Last Seen</th>
                        <th style={{ width: '110px' }}>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: count }).map((_, i) => (
                        <tr key={i}>
                            <td>
                                <span className="skeleton" style={{ width: '55px', height: '18px' }} />
                            </td>
                            <td>
                                <span className="skeleton" style={{ width: `${180 + (i * 40) % 120}px`, height: '16px' }} />
                                <span className="skeleton" style={{ width: '120px', height: '11px', display: 'block', marginTop: '4px' }} />
                            </td>
                            <td>
                                <span className="skeleton" style={{ width: '70px', height: '18px' }} />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                                <span className="skeleton" style={{ width: '30px', height: '14px' }} />
                            </td>
                            <td>
                                <span className="skeleton" style={{ width: '60px', height: '12px' }} />
                            </td>
                            <td>
                                <span className="skeleton" style={{ width: '75px', height: '22px' }} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

