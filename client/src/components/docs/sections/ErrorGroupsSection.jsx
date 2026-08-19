import CodeSnippet from '../CodeSnippet.jsx';

export default function ErrorGroupsSection() {
    return (
        <>
        <section id="get-groups" className="endpoint-card">
            <div className="endpoint-header">
                <span className="method-badge method-get">GET</span>
                <code className="endpoint-path">/api/projects/:id/groups</code>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Lists deduplicated error groups for a project with cursor-based pagination and search/severity filtering.
            </p>

            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                Query Parameters
            </div>
            <div className="table-wrap" style={{ marginBottom: '1rem' }}>
                <table>
                    <thead>
                        <tr>
                            <th style={{ width: '120px' }}>Parameter</th>
                            <th style={{ width: '90px' }}>Type</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><code>status</code></td>
                            <td><code>string</code></td>
                            <td>Filter by status: <code>"open"</code>, <code>"resolved"</code>, <code>"ignored"</code>, or <code>"all"</code>.</td>
                        </tr>
                        <tr>
                            <td><code>severity</code></td>
                            <td><code>string</code></td>
                            <td>Filter by AI severity: <code>"critical"</code>, <code>"high"</code>, <code>"medium"</code>, <code>"low"</code>, or <code>"all"</code>.</td>
                        </tr>
                        <tr>
                            <td><code>search</code></td>
                            <td><code>string</code></td>
                            <td>Case-insensitive substring search matching the error message.</td>
                        </tr>
                        <tr>
                            <td><code>limit</code></td>
                            <td><code>integer</code></td>
                            <td>Number of items to return (1-100, default 20).</td>
                        </tr>
                        <tr>
                            <td><code>cursor</code></td>
                            <td><code>string</code></td>
                            <td>Opaque pagination cursor from previous response's <code>nextCursor</code>.</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <CodeSnippet
                language="json"
                code={`{
          "success": true,
          "data": {
            "groups": [
              {
                "id": "6a84613ea1ab6cb5ed8394c1",
                "message": "Simulated payment processing failure",
                "status": "open",
                "count": 42,
                "firstSeen": "2026-08-18T11:00:00.000Z",
                "lastSeen": "2026-08-18T13:42:00.000Z",
                "firstSeenRelease": "v1.4.2",
                "aiSummary": {
                  "severity": "critical",
                  "rootCause": "Payment gateway timeout triggering unhandled promise rejection."
                }
              }
            ],
            "nextCursor": "eyJsYXN0U2VlbiI6IjIwMjYtMDgtMThUMTM6NDI6MDAuMDAwWiIsImlkIjoiNmE4NDYxM2VhMWFiNmNiNWVkODM5NGMxIn0="
          }
        }`}
            />
        </section>

        <section id="get-group-detail" className="endpoint-card">
            <div className="endpoint-header">
                <span className="method-badge method-get">GET</span>
                <code className="endpoint-path">/api/groups/:id</code>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Retrieves comprehensive error group intelligence, including grounded AI root cause analysis, suggested remediation checklist, resolved stack trace, and recent occurrences.
            </p>
            <CodeSnippet
                language="json"
                code={`{
          "success": true,
          "data": {
            "group": {
              "id": "6a84613ea1ab6cb5ed8394c1",
              "projectId": "6a8461196db5050326e164e3",
              "message": "Simulated payment processing failure",
              "status": "open",
              "count": 42,
              "aiSummary": {
                "severity": "critical",
                "rootCause": "A simulated payment processing failure mechanism was deployed to production.",
                "confidence": 0.95,
                "affectedFile": "/app/src/services/paymentService.js",
                "affectedFunction": "chargeCard",
                "suggestedFix": [
                  "Disable test simulation flags in production config.",
                  "Verify payment gateway credentials in environment variables."
                ]
              },
              "resolvedStack": [
                {
                  "functionName": "chargeCard",
                  "file": "src/services/paymentService.ts",
                  "lineNumber": 88,
                  "columnNumber": 11
                }
              ]
            },
            "events": [
              {
                "id": "6a84613ea1ab6cb5ed8394c2",
                "receivedAt": "2026-08-18T13:42:22.267Z",
                "env": "production",
                "release": "v1.4.2"
              }
            ],
            "trend": {
              "status": "ok",
              "isSpiking": false,
              "currentHourCount": 3,
              "baselineHourlyRate": 1.2
            }
          }
        }`}
            />
        </section>

        <section id="patch-group-status" className="endpoint-card">
            <div className="endpoint-header">
                <span className="method-badge method-patch">PATCH</span>
                <code className="endpoint-path">/api/groups/:id/status</code>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Updates the lifecycle triage status of an error group and records an entry in the group's status history audit log.
            </p>
            <CodeSnippet
                language="json"
                code={`// Request Body
        {
          "status": "resolved" // "open" | "resolved" | "ignored"
        }

        // Response (200 OK)
        {
          "success": true,
          "data": {
            "group": {
              "id": "6a84613ea1ab6cb5ed8394c1",
              "status": "resolved",
              "statusHistory": [
                {
                  "status": "resolved",
                  "changedAt": "2026-08-18T14:25:00.000Z"
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
