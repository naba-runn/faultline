import MultiLangSnippet from '../MultiLangSnippet.jsx';

export default function QuickstartSection() {
    return (
        <>
        <section id="quickstart" className="endpoint-card">
            <div className="endpoint-header">
                <span className="badge badge-severity-low">INTEGRATION GUIDE</span>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Quickstart & Application Instrumentation
                </h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>
                Faultline does not require heavyweight proprietary agents. You can instrument any Node.js, Express, Next.js, Python, or Go application with standard HTTP requests.
            </p>

            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '1.25rem', marginBottom: '0.5rem' }}>
                Canonical Error Handlers
            </h3>
            <MultiLangSnippet
                samples={{
                    'Express.js': `// Place this middleware AFTER all application route definitions
        const FAULTLINE_URL = process.env.FAULTLINE_API_URL || 'http://localhost:5050/api/events';
        const FAULTLINE_KEY = process.env.FAULTLINE_API_KEY; // 'flt_...'

        async function reportError(err, req) {
            if (!FAULTLINE_KEY) return;
            try {
                await fetch(FAULTLINE_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': \`Bearer \${FAULTLINE_KEY}\`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        message: err.message,
                        stack: err.stack,
                        env: process.env.NODE_ENV || 'production',
                        release: process.env.APP_VERSION || 'v1.0.0',
                        metadata: {
        path: req?.originalUrl,
        method: req?.method,
        ip: req?.ip,
                        },
                    }),
                });
            } catch (e) {
                console.error('Failed to dispatch error to Faultline:', e.message);
            }
        }

        app.use((err, req, res, next) => {
            reportError(err, req);
            res.status(500).json({ error: 'Internal server error' });
        });`,
                    'Python / Flask': `import os
        import requests
        import traceback
        from flask import Flask, request, jsonify

        FAULTLINE_URL = os.getenv("FAULTLINE_API_URL", "http://localhost:5050/api/events")
        FAULTLINE_KEY = os.getenv("FAULTLINE_API_KEY")

        def report_error(exception, request_obj=None):
            if not FAULTLINE_KEY:
                return
            payload = {
                "message": str(exception),
                "stack": traceback.format_exc(),
                "env": os.getenv("FLASK_ENV", "production"),
                "release": os.getenv("APP_VERSION", "v1.0.0"),
                "metadata": {
                    "path": request_obj.path if request_obj else None,
                    "method": request_obj.method if request_obj else None
                }
            }
            try:
                requests.post(
                    FAULTLINE_URL,
                    headers={"Authorization": f"Bearer {FAULTLINE_KEY}"},
                    json=payload,
                    timeout=2.0
                )
            except Exception as err:
                print(f"Failed to report to Faultline: {err}")

        @app.errorhandler(Exception)
        def handle_exception(e):
            report_error(e, request)
            return jsonify({"error": "Internal server error"}), 500`,
                    'cURL': `curl -X POST http://localhost:5050/api/events \\
          -H "Authorization: Bearer flt_your_project_api_key" \\
          -H "Content-Type: application/json" \\
          -d '{
            "message": "TypeError: Cannot read properties of undefined (reading '\''id'\'')",
            "stack": "TypeError: Cannot read properties of undefined (reading '\''id'\'')\\n    at getUser (/app/src/user.js:42:15)\\n    at handleRequest (/app/src/server.js:88:5)",
            "env": "production",
            "release": "v1.4.0",
            "metadata": {
              "userId": "usr_9918",
              "route": "/api/users/profile"
            }
          }'`,
                }}
            />
        </section>
        </>
    );
}
