import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { marked } from 'marked';
import api from '../api/axios.js';
import { useAuth } from '../context/AuthContext.jsx';

function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
}

// Custom renderer compatible with marked v12+
const renderer = {
    heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const plainText = text.replace(/<[^>]+>/g, '').replace(/`/g, '').trim();
        const slug = slugify(plainText);

        const match = plainText.match(/^(GET|POST|PATCH|DELETE)\s+(.+)$/);
        let contentHtml = text;
        if (match) {
            const method = match[1];
            const route = match[2];
            contentHtml = `<span class="http-method-badge method-${method}">${method}</span> <code>${route}</code>`;
        }

        return `<h${depth} id="${slug}">${contentHtml}</h${depth}>\n`;
    },
};

marked.use({ renderer, gfm: true });

function extractToc(markdown) {
    if (!markdown) return [];
    const lines = markdown.split('\n');
    const toc = [];

    for (const line of lines) {
        const h2Match = line.match(/^##\s+(.+)$/);
        const h3Match = line.match(/^###\s+(.+)$/);

        if (h2Match) {
            const title = h2Match[1].replace(/`/g, '').trim();
            toc.push({ level: 2, title, id: slugify(title) });
        } else if (h3Match && !line.startsWith('####')) {
            const title = h3Match[1].replace(/`/g, '').trim();
            toc.push({ level: 3, title, id: slugify(title) });
        }
    }
    return toc;
}

function ApiDocsPage() {
    const [markdown, setMarkdown] = useState('');
    const [updatedAt, setUpdatedAt] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Auth is optional on the docs page — show nav if logged in
    let user = null;
    let logout = null;
    try {
        const auth = useAuth();
        user = auth.user;
        logout = auth.logout;
    } catch {
        // Not wrapped in AuthProvider — public access
    }

    useEffect(() => {
        async function fetchDocs() {
            setLoading(true);
            setError('');
            try {
                const res = await api.get('/docs');
                setMarkdown(res.data.data.markdown);
                setUpdatedAt(res.data.data.updatedAt);
            } catch (err) {
                setError(err.response?.data?.error || 'Failed to load API reference.');
            } finally {
                setLoading(false);
            }
        }
        fetchDocs();
    }, []);

    const htmlContent = useMemo(() => {
        if (!markdown) return '';
        return marked.parse(markdown);
    }, [markdown]);

    const toc = useMemo(() => extractToc(markdown), [markdown]);

    return (
        <div className="page page-docs">
            {/* Topbar */}
            <header className="topbar">
                <div className="topbar-left">
                    <div className="topbar-brand">
                        <h1 className="brand-logo-text">FAULTLINE</h1>
                    </div>
                    <nav className="topbar-nav">
                        <Link to="/dashboard" className="topbar-link">Dashboard</Link>
                        <Link to="/docs" className="topbar-link active">API Docs</Link>
                    </nav>
                </div>
                {user && (
                    <div className="topbar-meta">
                        <span className="topbar-user">{user.name}</span>
                        <button type="button" className="btn-ghost btn-sm" onClick={logout}>
                            Log out
                        </button>
                    </div>
                )}
            </header>

            {/* Page Header */}
            <div className="docs-page-header">
                <h1>API Reference</h1>
                <div className="docs-meta">
                    Live documentation from <code style={{ fontSize: '0.72rem' }}>API.md</code>
                    {updatedAt && (
                        <span> · Updated {new Date(updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    )}
                </div>
            </div>

            {loading && <p className="cell-muted" style={{ fontSize: '0.82rem' }}>Loading API documentation…</p>}
            {error && <p className="alert alert-error" role="alert">{error}</p>}

            {!loading && !error && (
                <div className="docs-layout">
                    <nav className="docs-sidebar">
                        <h3 className="docs-toc-title">Navigation</h3>
                        <ul className="docs-toc-list">
                            {toc.map((item, idx) => (
                                <li
                                    key={idx}
                                    className={`toc-item toc-level-${item.level}`}
                                >
                                    <a href={`#${item.id}`}>{item.title}</a>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    <main className="docs-body">
                        <div
                            className="markdown-rendered"
                            dangerouslySetInnerHTML={{ __html: htmlContent }}
                        />
                    </main>
                </div>
            )}
        </div>
    );
}

export default ApiDocsPage;
