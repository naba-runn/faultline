import Sidebar from './Sidebar.jsx';

export default function AppLayout({ children, currentProjectId }) {
    return (
        <div className="app-shell">
            <Sidebar currentProjectId={currentProjectId} />
            <main className="app-workspace">
                <div className="workspace-container">
                    {children}
                </div>
            </main>
        </div>
    );
}
