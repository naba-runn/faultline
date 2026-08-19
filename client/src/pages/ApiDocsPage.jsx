import { useState, useMemo, useEffect } from 'react';
import AppLayout from '../components/AppLayout.jsx';
import { DOC_SECTIONS, API_BASE_URL } from '../components/docs/docsConfig.js';
import { Check, Copy, Globe, Search } from 'lucide-react';
import PlatformOverviewSection from '../components/docs/sections/PlatformOverviewSection.jsx';
import QuickstartSection from '../components/docs/sections/QuickstartSection.jsx';
import AuthSecuritySection from '../components/docs/sections/AuthSecuritySection.jsx';
import IngestionSection from '../components/docs/sections/IngestionSection.jsx';
import ProjectsSection from '../components/docs/sections/ProjectsSection.jsx';
import ErrorGroupsSection from '../components/docs/sections/ErrorGroupsSection.jsx';
import RealtimeAlertsSection from '../components/docs/sections/RealtimeAlertsSection.jsx';
import HealthDashboardSection from '../components/docs/sections/HealthDashboardSection.jsx';


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
                    <PlatformOverviewSection />
                    <QuickstartSection />
                    <AuthSecuritySection />
                    <IngestionSection />
                    <ProjectsSection />
                    <ErrorGroupsSection />
                    <RealtimeAlertsSection />
                    <HealthDashboardSection />
                </main>
            </div>
        </AppLayout>
    );
}
