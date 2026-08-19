import CodeSnippet from '../CodeSnippet.jsx';

export default function IngestionSection() {
    return (
        <>
        <section id="post-events" className="endpoint-card">
            <div className="endpoint-header">
                <span className="method-badge method-post">POST</span>
                <code className="endpoint-path">/api/events</code>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Ingests a runtime error occurrence into Faultline. Groups identical errors using stack trace normalization and SHA-256 fingerprinting.
            </p>

            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                Headers
            </div>
            <div style={{ background: 'var(--bg-secondary)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', marginBottom: '1rem' }}>
                <div>Authorization: Bearer flt_&lt;your_project_api_key&gt;</div>
                <div>Content-Type: application/json</div>
            </div>

            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                Request Body Parameters
            </div>
            <div className="table-wrap" style={{ marginBottom: '1rem' }}>
                <table>
                    <thead>
                        <tr>
                            <th style={{ width: '130px' }}>Field</th>
                            <th style={{ width: '90px' }}>Type</th>
                            <th style={{ width: '90px' }}>Required</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><code>message</code></td>
                            <td><code>string</code></td>
                            <td><span className="badge badge-severity-critical">Required</span></td>
                            <td>The error message (max 1,000 characters).</td>
                        </tr>
                        <tr>
                            <td><code>stack</code></td>
                            <td><code>string</code></td>
                            <td><span className="badge badge-severity-critical">Required</span></td>
                            <td>Full stack trace with file paths and line numbers (max 10,000 characters).</td>
                        </tr>
                        <tr>
                            <td><code>env</code></td>
                            <td><code>string</code></td>
                            <td><span className="badge badge-severity-low">Optional</span></td>
                            <td>Deployment environment (e.g. <code>"production"</code>, <code>"staging"</code>). Defaults to <code>"production"</code>.</td>
                        </tr>
                        <tr>
                            <td><code>release</code></td>
                            <td><code>string</code></td>
                            <td><span className="badge badge-severity-low">Optional</span></td>
                            <td>Application version tag or git commit SHA (e.g. <code>"v1.4.2"</code>).</td>
                        </tr>
                        <tr>
                            <td><code>metadata</code></td>
                            <td><code>object</code></td>
                            <td><span className="badge badge-severity-low">Optional</span></td>
                            <td>Arbitrary key-value context dictionary for additional telemetry.</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                Response (202 Accepted)
            </div>
            <CodeSnippet
                language="json"
                code={`{
          "success": true,
          "data": {
            "eventId": "6a84613ea1ab6cb5ed8394c2",
            "groupId": "6a84613ea1ab6cb5ed8394c1",
            "status": "ingested",
            "isNewGroup": false
          }
        }`}
            />
        </section>

        {/* SECTION: POST /api/projects/:id/sourcemaps */}
        <section id="post-sourcemaps" className="endpoint-card">
            <div className="endpoint-header">
                <span className="method-badge method-post">POST</span>
                <code className="endpoint-path">/api/projects/:id/sourcemaps</code>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Uploads a JavaScript Source Map v3 file to translate minified production stack frames into original source filenames, lines, and functions.
            </p>

            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                Multipart Form Data
            </div>
            <div className="table-wrap" style={{ marginBottom: '1rem' }}>
                <table>
                    <thead>
                        <tr>
                            <th style={{ width: '130px' }}>Field</th>
                            <th style={{ width: '90px' }}>Type</th>
                            <th style={{ width: '90px' }}>Required</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><code>file</code></td>
                            <td><code>file</code></td>
                            <td><span className="badge badge-severity-critical">Required</span></td>
                            <td>The <code>.map</code> file containing standard Source Map v3 JSON.</td>
                        </tr>
                        <tr>
                            <td><code>release</code></td>
                            <td><code>string</code></td>
                            <td><span className="badge badge-severity-critical">Required</span></td>
                            <td>The release version matching the bundle (e.g. <code>"v1.4.2"</code>).</td>
                        </tr>
                        <tr>
                            <td><code>minifiedFilePath</code></td>
                            <td><code>string</code></td>
                            <td><span className="badge badge-severity-critical">Required</span></td>
                            <td>The minified filename or URL path (e.g. <code>"/static/js/main.min.js"</code>).</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <CodeSnippet
                language="bash"
                code={`curl -X POST http://localhost:5050/api/projects/6a8461196db5050326e164e3/sourcemaps \\
          -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \\
          -F "release=v1.4.2" \\
          -F "minifiedFilePath=/dist/bundle.min.js" \\
          -F "file=@./dist/bundle.min.js.map"`}
            />
        </section>
        </>
    );
}
