import CodeSnippet from '../CodeSnippet.jsx';

export default function HealthDashboardSection() {
    return (
        <>
        <section id="get-health" className="endpoint-card">
            <div className="endpoint-header">
                <span className="method-badge method-get">GET</span>
                <code className="endpoint-path">/health</code>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Public liveness and health probe for load balancers and container orchestrators.
            </p>
            <CodeSnippet
                language="json"
                code={`{
          "success": true,
          "status": "healthy",
          "env": "production",
          "timestamp": "2026-08-18T14:15:00.000Z"
        }`}
            />
        </section>

        <section id="get-overview" className="endpoint-card">
            <div className="endpoint-header">
                <span className="method-badge method-get">GET</span>
                <code className="endpoint-path">/api/projects/overview</code>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Aggregates organization-wide telemetry across all projects owned by the user (24-hour error volume timeline, active spikes, and unresolved error count).
            </p>
            <CodeSnippet
                language="json"
                code={`{
          "success": true,
          "data": {
            "unresolvedCount": 3,
            "lastEventAt": "2026-08-18T13:42:22.267Z",
            "trend": {
              "series": [
                { "hour": "2026-08-18T13:00:00.000Z", "count": 12 },
                { "hour": "2026-08-18T14:00:00.000Z", "count": 4 }
              ]
            },
            "alerts": {
              "spikingGroups": []
            },
            "releases": {
              "recent": [
                {
                  "groupId": "6a84613ea1ab6cb5ed8394c1",
                  "message": "Simulated payment processing failure",
                  "projectName": "api-gateway",
                  "release": "v1.4.2",
                  "severity": "critical",
                  "count": 42,
                  "status": "open",
                  "lastSeen": "2026-08-18T13:42:22.267Z"
                }
              ]
            }
          }
        }`}
            />
        </section>
        </>
    );
}
