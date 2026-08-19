import { Zap, Terminal, Layers, AlertCircle, Bell, Activity } from 'lucide-react';

export const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ||
    (typeof window !== 'undefined' && import.meta.env.PROD
        ? `${window.location.origin}/api`
        : 'http://localhost:5050/api');

export const DOC_SECTIONS = [
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
