import CodeSnippet from '../CodeSnippet.jsx';

export default function ProjectsSection() {
    return (
        <>
        <section id="get-projects" className="endpoint-card">
            <div className="endpoint-header">
                <span className="method-badge method-get">GET</span>
                <code className="endpoint-path">/api/projects</code>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Returns all monitored projects owned by the authenticated user account.
            </p>
            <CodeSnippet
                language="json"
                code={`{
          "success": true,
          "data": {
            "projects": [
              {
                "id": "6a8461196db5050326e164e3",
                "name": "api-gateway",
                "githubRepo": "org/api-gateway",
                "createdAt": "2026-08-18T13:42:00.000Z",
                "updatedAt": "2026-08-18T13:42:00.000Z"
              }
            ]
          }
        }`}
            />
        </section>

        <section id="post-projects" className="endpoint-card">
            <div className="endpoint-header">
                <span className="method-badge method-post">POST</span>
                <code className="endpoint-path">/api/projects</code>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Creates a new monitored project and returns the unhashed Ingestion API Key (one-time return).
            </p>
            <CodeSnippet
                language="json"
                code={`// Request Body
        {
          "name": "payment-service",
          "githubRepo": "my-org/payment-service"
        }

        // Response (201 Created)
        {
          "success": true,
          "data": {
            "project": {
              "id": "6a8463696db5050326e1665a",
              "name": "payment-service",
              "githubRepo": "my-org/payment-service",
              "createdAt": "2026-08-18T13:51:48.000Z"
            },
            "apiKey": "flt_4a9b2c8e1d5f3089a7e6b4c2d0f81e3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e"
          }
        }`}
            />
        </section>

        <section id="get-project" className="endpoint-card">
            <div className="endpoint-header">
                <span className="method-badge method-get">GET</span>
                <code className="endpoint-path">/api/projects/:id</code>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Retrieves metadata and repository configuration for a specific project.
            </p>
            <CodeSnippet
                language="json"
                code={`{
          "success": true,
          "data": {
            "project": {
              "id": "6a8461196db5050326e164e3",
              "name": "api-gateway",
              "githubRepo": "org/api-gateway",
              "createdAt": "2026-08-18T13:42:00.000Z",
              "updatedAt": "2026-08-18T13:42:00.000Z"
            }
          }
        }`}
            />
        </section>

        <section id="patch-project" className="endpoint-card">
            <div className="endpoint-header">
                <span className="method-badge method-patch">PATCH</span>
                <code className="endpoint-path">/api/projects/:id</code>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Updates project properties such as the display name or connected GitHub repository.
            </p>
            <CodeSnippet
                language="json"
                code={`// Request Body
        {
          "name": "api-gateway-v2",
          "githubRepo": "org/api-gateway-next"
        }

        // Response (200 OK)
        {
          "success": true,
          "data": {
            "project": {
              "id": "6a8461196db5050326e164e3",
              "name": "api-gateway-v2",
              "githubRepo": "org/api-gateway-next",
              "updatedAt": "2026-08-18T14:20:00.000Z"
            }
          }
        }`}
            />
        </section>

        <section id="delete-project" className="endpoint-card">
            <div className="endpoint-header">
                <span className="method-badge method-delete">DELETE</span>
                <code className="endpoint-path">/api/projects/:id</code>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Permanently deletes a project and cascade removes all associated error groups, events, and source maps.
            </p>
            <CodeSnippet
                language="json"
                code={`{
          "success": true,
          "data": {
            "message": "Project and associated telemetry deleted successfully."
          }
        }`}
            />
        </section>

        <section id="post-simulate" className="endpoint-card">
            <div className="endpoint-header">
                <span className="method-badge method-post">POST</span>
                <code className="endpoint-path">/api/projects/:id/simulate</code>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Ingests a synthetic, randomized test error to verify ingestion pipelines, live SSE dashboard updates, and alert triggers without writing custom client code.
            </p>
            <CodeSnippet
                language="json"
                code={`{
          "success": true,
          "data": {
            "simulated": true,
            "eventId": "6a84613ea1ab6cb5ed8394c2",
            "groupId": "6a84613ea1ab6cb5ed8394c1",
            "message": "Simulated payment processing failure"
          }
        }`}
            />
        </section>
        </>
    );
}
