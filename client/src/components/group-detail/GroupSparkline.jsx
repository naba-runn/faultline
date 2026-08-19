export function buildHourlySparklineBuckets(events) {
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

export default function Sparkline({ buckets }) {
    if (!buckets || buckets.length === 0) {
        return <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No event data to chart.</p>;
    }

    const width = 320;
    const height = 48;
    const padding = 4;
    const innerW = width - padding * 2;
    const innerH = height - padding * 2;

    const counts = buckets.map((b) => b.count);
    const max = Math.max(1, ...counts);
    const step = buckets.length > 1 ? innerW / (buckets.length - 1) : 0;

    const points = buckets.map((b, idx) => {
        const x = padding + idx * step;
        const y = padding + innerH - (b.count / max) * innerH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const polylineStr = points.join(' ');

    const lastIdx = buckets.length - 1;
    const areaPoints = [
        `${padding},${padding + innerH}`,
        ...points,
        `${padding + lastIdx * step},${padding + innerH}`,
    ].join(' ');

    const peakBucket = buckets.reduce((p, c) => (c.count > p.count ? c : p), buckets[0]);

    return (
        <div style={{ marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                <span>Peak: {peakBucket.count}/hr</span>
                <span>Trailing 24h</span>
            </div>
            <svg
                viewBox={`0 0 ${width} ${height + 16}`}
                style={{ width: '100%', height: 'auto', display: 'block' }}
                role="img"
                aria-label="Hourly error rate sparkline"
            >
                <polygon points={areaPoints} fill="var(--accent-subtle)" />
                <polyline
                    points={polylineStr}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <line x1={padding} y1={padding + innerH} x2={padding + lastIdx * step} y2={padding + innerH} stroke="var(--border)" strokeWidth="1" />
                <text x={padding} y={height + 12} fontSize="9" fill="var(--text-muted)">
                    {buckets[0].label}
                </text>
                <text x={padding + lastIdx * step} y={height + 12} fontSize="9" textAnchor="end" fill="var(--text-muted)">
                    now
                </text>
            </svg>
        </div>
    );
}

