import { useState } from 'react';
import { formatHourLabel } from '../../utils/formatters.js';

export default function TrendChart({ series }) {
    const [hoveredIndex, setHoveredIndex] = useState(null);
    const totalCount = series.reduce((sum, b) => sum + b.count, 0);
    const maxCount = Math.max(1, ...series.map((b) => b.count));
    const width = 800;
    const height = 64;
    const barGap = 4;
    const barWidth = (width - barGap * (series.length - 1)) / series.length;

    if (totalCount === 0) {
        return (
            <div className="empty-state-compact">
                <span className="empty-state-compact-title">No error activity</span>
                <span className="empty-state-compact-desc">Your applications have reported no errors in the trailing 24 hours.</span>
            </div>
        );
    }

    return (
        <div className="chart-surface">
            <div className="trend-chart-container">
                <svg
                    viewBox={`0 0 ${width} ${height + 26}`}
                    className="trend-chart-svg"
                    role="img"
                    aria-label="Hourly error volume over the last 24 hours"
                >
                    <defs>
                        <linearGradient id="tealTrendGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.85" />
                            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.45" />
                        </linearGradient>
                    </defs>

                    {/* Subtle grid baselines */}
                    <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="var(--border-light)" strokeWidth="1" strokeDasharray="3 3" />
                    <line x1="0" y1={height} x2={width} y2={height} stroke="var(--border)" strokeWidth="1" />

                    {series.map((bucket, i) => {
                        const hasCount = bucket.count > 0;
                        const barHeight = hasCount ? Math.max(5, (bucket.count / maxCount) * height) : 2;
                        const x = i * (barWidth + barGap);
                        const y = height - barHeight;
                        const isHovered = hoveredIndex === i;

                        return (
                            <g
                                key={bucket.hour}
                                onMouseEnter={() => setHoveredIndex(i)}
                                onMouseLeave={() => setHoveredIndex(null)}
                            >
                                <rect
                                    x={x}
                                    y={y}
                                    width={barWidth}
                                    height={barHeight}
                                    rx={2}
                                    fill={hasCount ? 'url(#tealTrendGrad)' : 'var(--border-light)'}
                                    opacity={hasCount ? (isHovered ? 1 : 0.8) : 0.4}
                                    style={{ transition: 'opacity 150ms ease' }}
                                >
                                    <title>{`${formatHourLabel(bucket.hour)}: ${bucket.count} error${bucket.count === 1 ? '' : 's'}`}</title>
                                </rect>
                            </g>
                        );
                    })}

                    {/* Axis Labels */}
                    <text x={0} y={height + 18} className="trend-chart-axis-label">
                        {formatHourLabel(series[0].hour)} (24h ago)
                    </text>
                    <text x={width / 2} y={height + 18} textAnchor="middle" className="trend-chart-axis-label">
                        {formatHourLabel(series[12].hour)}
                    </text>
                    <text x={width} y={height + 18} textAnchor="end" className="trend-chart-axis-label">
                        Now
                    </text>
                </svg>
            </div>
        </div>
    );
}

