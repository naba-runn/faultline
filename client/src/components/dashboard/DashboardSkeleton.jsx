export default function DashboardMetricsSkeleton() {
    return (
        <div className="metrics-grid" aria-busy="true" aria-label="Loading metrics">
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="metric-panel">
                    <div className="metric-panel-header">
                        <span className="skeleton" style={{ width: '60px', height: '12px' }} />
                    </div>
                    <span className="skeleton" style={{ width: '48px', height: '28px', marginTop: '0.25rem' }} />
                </div>
            ))}
        </div>
    );
}

