import CodeSnippet from '../CodeSnippet.jsx';

export default function RealtimeAlertsSection() {
    return (
        <>
        <section id="post-sse-ticket" className="endpoint-card">
            <div className="endpoint-header">
                <span className="method-badge method-post">POST</span>
                <code className="endpoint-path">/api/projects/:id/sse-ticket</code>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Issues a short-lived, single-use ticket for connecting to the Server-Sent Events (SSE) live telemetry stream.
            </p>
            <CodeSnippet
                language="json"
                code={`// Request (Requires User JWT)
        POST /api/projects/6a8461196db5050326e164e3/sse-ticket

        // Response (201 Created)
        {
          "success": true,
          "data": {
            "ticket": "d8e2a7db712ece2d9d3273d1c36289f08df4241f144deaed"
          }
        }`}
            />
        </section>

        <section id="get-sse-stream" className="endpoint-card">
            <div className="endpoint-header">
                <span className="method-badge method-get">GET</span>
                <code className="endpoint-path">/api/sse/stream?ticket=&lt;ticket&gt;</code>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Establishes an HTTP Server-Sent Events (SSE) persistent stream for real-time error event notifications and live dashboard telemetry.
            </p>
            <CodeSnippet
                language="javascript"
                code={`// Browser / Client SSE Subscription
        async function subscribeToLiveProject(projectId) {
            const ticketRes = await fetch(\`/api/projects/\${projectId}/sse-ticket\`, {
                method: 'POST',
                headers: { 'Authorization': \`Bearer \${token}\` },
            });
            const { ticket } = (await ticketRes.json()).data;

            const eventSource = new EventSource(\`/api/sse/stream?ticket=\${ticket}\`);

            eventSource.onmessage = (event) => {
                const payload = JSON.parse(event.data);
                console.log('Live Event Received:', payload.type, payload.data);
            };
        }`}
            />
        </section>

        <section id="get-alerts" className="endpoint-card">
            <div className="endpoint-header">
                <span className="method-badge method-get">GET</span>
                <code className="endpoint-path">/api/projects/:id/alerts</code>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Retrieves notification channels and trigger rules configured for a project.
            </p>
            <CodeSnippet
                language="json"
                code={`{
          "success": true,
          "data": {
            "alertConfig": {
              "triggers": {
                "newGroup": true,
                "severityThreshold": "high",
                "spikeDetection": {
                  "enabled": true,
                  "multiplier": 3.0,
                  "floor": 5
                }
              },
              "webhook": {
                "enabled": true,
                "url": "https://hooks.slack.com/services/T00/B00/XXXX"
              },
              "email": {
                "enabled": false,
                "recipients": ["alerts@company.com"]
              }
            }
          }
        }`}
            />
        </section>

        <section id="patch-alerts" className="endpoint-card">
            <div className="endpoint-header">
                <span className="method-badge method-patch">PATCH</span>
                <code className="endpoint-path">/api/projects/:id/alerts</code>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Updates notification webhooks, alert triggers, and spike anomaly detection parameters.
            </p>
            <CodeSnippet
                language="json"
                code={`// Request Body
        {
          "triggers": {
            "newGroup": true,
            "severityThreshold": "critical",
            "spikeDetection": {
              "enabled": true,
              "multiplier": 2.5,
              "floor": 10
            }
          },
          "webhook": {
            "enabled": true,
            "url": "https://discord.com/api/webhooks/..."
          }
        }

        // Response (200 OK)
        {
          "success": true,
          "data": {
            "alertConfig": { ... }
          }
        }`}
            />
        </section>
        </>
    );
}
