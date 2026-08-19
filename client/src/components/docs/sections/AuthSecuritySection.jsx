import { Shield, Key } from 'lucide-react';

export default function AuthSecuritySection() {
    return (
        <>
        <section id="auth-security" className="endpoint-card">
            <div className="endpoint-header">
                <Shield size={16} style={{ color: 'var(--accent)' }} />
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Authentication & Tokens
                </h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>
                Faultline implements two distinct authorization schemes depending on the caller type:
            </p>

            <div className="table-wrap" style={{ margin: '1rem 0' }}>
                <table>
                    <thead>
                        <tr>
                            <th style={{ width: '180px' }}>Token Type</th>
                            <th style={{ width: '130px' }}>Format</th>
                            <th>Target Scope</th>
                            <th style={{ width: '160px' }}>Storage Policy</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Ingestion API Key</span>
                            </td>
                            <td>
                                <code style={{ fontSize: '0.75rem' }}>flt_&lt;64-hex&gt;</code>
                            </td>
                            <td>Telemetry Ingestion (<code style={{ fontSize: '0.75rem' }}>POST /api/events</code>)</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Stored as SHA-256 hash</td>
                        </tr>
                        <tr>
                            <td>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>User JWT Token</span>
                            </td>
                            <td>
                                <code style={{ fontSize: '0.75rem' }}>Bearer &lt;jwt&gt;</code>
                            </td>
                            <td>Management APIs (Projects, Groups, Alerts)</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Signed HMAC-SHA256</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="empty-state-compact" style={{ background: 'var(--bg-subtle)' }}>
                <span className="empty-state-compact-title" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Key size={14} style={{ color: 'var(--accent)' }} /> API Key One-Time Display
                </span>
                <span className="empty-state-compact-desc">
                    Raw ingestion API keys (<code style={{ fontSize: '0.75rem' }}>flt_...</code>) are shown exactly once at project creation time. Faultline persists only SHA-256 cryptographic hashes. Store the raw key securely in your production environment variables.
                </span>
            </div>
        </section>
        </>
    );
}
