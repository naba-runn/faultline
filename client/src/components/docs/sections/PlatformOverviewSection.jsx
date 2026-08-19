
export default function PlatformOverviewSection() {
    return (
        <>
        <section id="overview" className="endpoint-card">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                Platform Architecture & Ingestion Flow
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '1rem' }}>
                Faultline receives runtime errors from your external applications via an authenticated, language-agnostic HTTP ingestion engine. Ingested events are deduplicated in real-time, categorized into error groups, enriched with AI root cause analysis, and broadcast to connected dashboards.
            </p>

            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', margin: '1rem 0', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)', overflowX: 'auto' }}>
                <div style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: '0.35rem' }}>[Application Runtime]</div>
                <div> └─ Throws Exception ──► HTTP POST /api/events (Bearer flt_...)</div>
                <div style={{ margin: '0.4rem 0', color: 'var(--text-muted)' }}>                             │</div>
                <div style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: '0.35rem' }}>[Faultline Ingestion Engine]</div>
                <div> ├─ 1. SHA-256 API Key Verification</div>
                <div> ├─ 2. Stack Trace Normalization & SHA-256 Fingerprinting</div>
                <div> ├─ 3. Atomic ErrorGroup Upsert & Occurrence Counting</div>
                <div> ├─ 4. Real-time SSE Dispatch to Connected Dashboards</div>
                <div> └─ 5. Asynchronous Gemini AI Root Cause Analysis & Fix Generation</div>
            </div>
        </section>
        </>
    );
}
