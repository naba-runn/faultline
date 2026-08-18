import { useState, useMemo, useEffect } from 'react';
import {
    Terminal,
    Copy,
    Check,
    Search,
    Shield,
    Zap,
    Layers,
    Code2,
    Activity,
    Bell,
    Globe,
    CheckCircle2,
    AlertCircle,
    ChevronRight,
    ExternalLink,
    Key,
    Trash2,
    Play
} from 'lucide-react';
import AppLayout from '../components/AppLayout.jsx';

const API_BASE_URL = 'http://localhost:5050/api';

const DOC_SECTIONS = [
    {
        id: 'getting-started',
        title: 'Getting Started',
        icon: Zap,
        items: [
            { id: 'overview', title: 'Platform Overview' },
            { id: 'quickstart', title: 'Quickstart & Node.js SDK' },
            { id: 'auth-security', title: 'Authentication & Security' },
        ],
    },
    {
        id: 'ingestion',
        title: 'Telemetry Ingestion',
        icon: Terminal,
        items: [
            { id: 'post-events', title: 'Ingest Error Event', method: 'POST', path: '/events' },
            { id: 'post-sourcemaps', title: 'Upload Source Maps', method: 'POST', path: '/projects/:id/sourcemaps' },
        ],
    },
    {
        id: 'projects',
        title: 'Projects & Applications',
        icon: Layers,
        items: [
            { id: 'get-projects', title: 'List Projects', method: 'GET', path: '/projects' },
            { id: 'post-projects', title: 'Create Project', method: 'POST', path: '/projects' },
            { id: 'get-project', title: 'Get Project Details', method: 'GET', path: '/projects/:id' },
            { id: 'patch-project', title: 'Update Project', method: 'PATCH', path: '/projects/:id' },
            { id: 'delete-project', title: 'Delete Project', method: 'DELETE', path: '/projects/:id' },
            { id: 'post-simulate', title: 'Simulate Error', method: 'POST', path: '/projects/:id/simulate' },
        ],
    },
    {
        id: 'error-groups',
        title: 'Issues & Error Groups',
        icon: AlertCircle,
        items: [
            { id: 'get-groups', title: 'List Project Error Groups', method: 'GET', path: '/projects/:id/groups' },
            { id: 'get-group-detail', title: 'Get Group Detail', method: 'GET', path: '/groups/:id' },
            { id: 'patch-group-status', title: 'Update Group Status', method: 'PATCH', path: '/groups/:id/status' },
        ],
    },
    {
        id: 'realtime-alerts',
        title: 'Real-Time & Alerting',
        icon: Bell,
        items: [
            { id: 'post-sse-ticket', title: 'Request SSE Ticket', method: 'POST', path: '/projects/:id/sse-ticket' },
            { id: 'get-sse-stream', title: 'Live Event Stream', method: 'GET', path: '/sse/stream' },
            { id: 'get-alerts', title: 'Get Alert Config', method: 'GET', path: '/projects/:id/alerts' },
            { id: 'patch-alerts', title: 'Update Alert Config', method: 'PATCH', path: '/projects/:id/alerts' },
        ],
    },
    {
        id: 'system',
        title: 'System & Health',
        icon: Activity,
        items: [
            { id: 'get-health', title: 'Health Check', method: 'GET', path: '/health' },
            { id: 'get-overview', title: 'Dashboard Overview', method: 'GET', path: '/projects/overview' },
        ],
    },
];

function CodeSnippet({ code, language = 'javascript' }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="sdk-snippet-container" style={{ margin: '0.85rem 0' }}>
            <div className="sdk-snippet-header">
                <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: '#A0A6A0' }}>
                    {language.toUpperCase()}
                </span>
                <button type="button" className="btn-copy-snippet" onClick={handleCopy}>
                    {copied ? (
                        <>
                            <Check size={11} style={{ color: 'var(--success)' }} /> Copied
                        </>
                    ) : (
                        <>
                            <Copy size={11} /> Copy
                        </>
                    )}
                </button>
            </div>
            <pre className="sdk-code-block">{code}</pre>
        </div>
    );
}

function MultiLangSnippet({ samples }) {
    const [activeTab, setActiveTab] = useState(Object.keys(samples)[0]);
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(samples[activeTab]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="sdk-snippet-container" style={{ margin: '0.85rem 0' }}>
            <div className="sdk-snippet-header">
                <div className="sdk-snippet-tabs">
                    {Object.keys(samples).map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            className={`sdk-tab ${activeTab === tab ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
                <button type="button" className="btn-copy-snippet" onClick={handleCopy}>
                    {copied ? (
                        <>
                            <Check size={11} style={{ color: 'var(--success)' }} /> Copied
                        </>
                    ) : (
                        <>
                            <Copy size={11} /> Copy
                        </>
                    )}
                </button>
            </div>
            <pre className="sdk-code-block">{samples[activeTab]}</pre>
        </div>
    );
}

export default function ApiDocsPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeSection, setActiveSection] = useState('overview');
    const [baseUrlCopied, setBaseUrlCopied] = useState(false);

    const handleCopyBaseUrl = () => {
        navigator.clipboard.writeText(API_BASE_URL);
        setBaseUrlCopied(true);
        setTimeout(() => setBaseUrlCopied(false), 2000);
    };

    const scrollToSection = (e, id) => {
        e.preventDefault();
        const target = document.getElementById(id);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setActiveSection(id);
            window.history.replaceState(null, '', `#${id}`);
        }
    };

    // Track active section on scroll
    useEffect(() => {
        const handleScroll = () => {
            const sections = document.querySelectorAll('.endpoint-card');
            let current = 'overview';
            sections.forEach((sec) => {
                const rect = sec.getBoundingClientRect();
                if (rect.top <= 140 && rect.bottom >= 140) {
                    current = sec.id;
                }
            });
            if (current) setActiveSection(current);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const filteredSections = useMemo(() => {
        if (!searchQuery.trim()) return DOC_SECTIONS;
        const q = searchQuery.toLowerCase();
        return DOC_SECTIONS.map((sec) => ({
            ...sec,
            items: sec.items.filter(
                (item) =>
                    item.title.toLowerCase().includes(q) ||
                    (item.path && item.path.toLowerCase().includes(q)) ||
                    (item.method && item.method.toLowerCase().includes(q))
            ),
        })).filter((sec) => sec.items.length > 0);
    }, [searchQuery]);

    return (
        <AppLayout>
            {/* Header */}
            <div className="dash-header-bar">
                <div className="dash-header-info">
                    <h1>API & SDK Reference</h1>
                    <p className="dash-header-desc">
                        Complete technical specifications for HTTP telemetry ingestion, management APIs, and real-time event subscriptions.
                    </p>
                </div>
                <div className="dash-header-actions">
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleCopyBaseUrl}
                        title="Copy Base API URL"
                    >
                        <Globe size={13} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{API_BASE_URL}</span>
                        {baseUrlCopied ? <Check size={13} style={{ color: 'var(--success)' }} /> : <Copy size={13} />}
                    </button>
                </div>
            </div>

            <div className="docs-layout">
                {/* Sticky Documentation Sidebar */}
                <nav className="docs-sidebar">
                    <div style={{ marginBottom: '1rem', position: 'relative' }}>
                        <Search
                            size={14}
                            style={{
                                position: 'absolute',
                                left: '0.65rem',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: 'var(--text-muted)',
                            }}
                        />
                        <input
                            type="text"
                            placeholder="Filter endpoints..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="input-control"
                            style={{
                                paddingLeft: '2rem',
                                fontSize: '0.78rem',
                                height: '32px',
                                width: '100%',
                            }}
                        />
                    </div>

                    <div className="docs-toc-nav">
                        {filteredSections.map((sec) => (
                            <div key={sec.id} style={{ marginBottom: '1.25rem' }}>
                                <div className="docs-toc-title" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <sec.icon size={12} style={{ color: 'var(--accent)' }} />
                                    <span>{sec.title}</span>
                                </div>
                                {sec.items.map((item) => {
                                    const isActive = activeSection === item.id;
                                    return (
                                        <a
                                            key={item.id}
                                            href={`#${item.id}`}
                                            onClick={(e) => scrollToSection(e, item.id)}
                                            className={`docs-toc-link ${isActive ? 'active' : ''}`}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '0.5rem',
                                            }}
                                        >
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {item.title}
                                            </span>
                                            {item.method && (
                                                <span className={`method-badge method-${item.method.toLowerCase()}`} style={{ fontSize: '0.62rem', padding: '1px 4px' }}>
                                                    {item.method}
                                                </span>
                                            )}
                                        </a>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </nav>

                {/* Main Documentation Content */}
                <main className="docs-content-body">
                    {/* SECTION: PLATFORM OVERVIEW */}
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

                    {/* SECTION: QUICKSTART & NODE SDK */}
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

                    {/* SECTION: AUTH & SECURITY */}
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

                    {/* SECTION: POST /api/events */}
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

                    {/* SECTION: PROJECTS API */}
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

                    {/* SECTION: ERROR GROUPS & ISSUES */}
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

                    {/* SECTION: REALTIME SSE & ALERTS */}
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

                    {/* SECTION: HEALTH & DASHBOARD */}
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
                </main>
            </div>
        </AppLayout>
    );
}
