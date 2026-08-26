import { useState, useEffect, useCallback, useRef } from 'react';
import { Trash2, UploadCloud, FileCode } from 'lucide-react';
import api from '../../api/axios.js';
import { formatRelativeTime } from '../../utils/formatters.js';

// Task 32 shipped POST/GET/DELETE /api/projects/:id/sourcemaps with no
// client UI at all — upload was API-only, meant for a build-tool/CI
// step holding the project's API key, not a human. This closes that
// gap: a small drawer (same expandable-panel pattern as
// SdkSnippetGenerator) for uploading a .map file by hand and managing
// what's already been uploaded, for cases where there's no CI step
// wired up yet (a portfolio demo, a manual test) and someone just
// wants to drag in a source map from the dashboard.
function SourceMapManager({ projectId, onClose }) {
    const [sourceMaps, setSourceMaps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    const [filename, setFilename] = useState('');
    const [release, setRelease] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [uploadSuccess, setUploadSuccess] = useState('');

    const [deletingId, setDeletingId] = useState(null);
    const fileInputRef = useRef(null);

    const fetchSourceMaps = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const res = await api.get(`/projects/${projectId}/sourcemaps`);
            setSourceMaps(res.data?.data?.sourceMaps || []);
        } catch (err) {
            setLoadError(err.response?.data?.error || 'Failed to load source maps.');
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchSourceMaps();
    }, [fetchSourceMaps]);

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        setSelectedFile(file || null);
        // Pre-fill filename from the picked file if the field is still
        // empty — a real .map file's own name (e.g. "app.min.js.map")
        // is a reasonable default, not the exact `filename` the server
        // matches stack frames against (that's the *minified bundle's*
        // name, e.g. "app.min.js") — left editable, not auto-corrected,
        // since only the uploader actually knows their build's naming.
        if (file && !filename) {
            setFilename(file.name.replace(/\.map$/, ''));
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        setUploadError('');
        setUploadSuccess('');

        if (!filename.trim()) {
            setUploadError('Filename is required (the minified bundle name this map resolves, e.g. "app.min.js").');
            return;
        }
        if (!selectedFile) {
            setUploadError('Choose a .map file to upload.');
            return;
        }

        setUploading(true);
        try {
            const rawText = await selectedFile.text();
            let mapJson;
            try {
                mapJson = JSON.parse(rawText);
            } catch (err) {
                setUploadError('That file is not valid JSON — is it really a source map?');
                setUploading(false);
                return;
            }

            const res = await api.post(`/projects/${projectId}/sourcemaps`, {
                filename: filename.trim(),
                release: release.trim() || undefined,
                map: mapJson,
            });

            setUploadSuccess(`Uploaded "${res.data.data.sourceMap.filename}"${release.trim() ? ` for release ${release.trim()}` : ''}.`);
            setFilename('');
            setRelease('');
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            fetchSourceMaps();
        } catch (err) {
            setUploadError(err.response?.data?.error || 'Upload failed.');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (mapId) => {
        setDeletingId(mapId);
        try {
            await api.delete(`/projects/${projectId}/sourcemaps/${mapId}`);
            setSourceMaps((prev) => prev.filter((m) => m.id !== mapId));
        } catch (err) {
            setLoadError(err.response?.data?.error || 'Failed to delete source map.');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="sdk-snippet-container">
            <div className="sdk-snippet-header">
                <div className="sdk-snippet-tabs">
                    <span className="sdk-tab active" style={{ cursor: 'default' }}>
                        <FileCode size={13} style={{ marginRight: '0.35rem', verticalAlign: '-2px' }} />
                        Source Maps
                    </span>
                </div>
                {onClose && (
                    <button type="button" className="btn-copy-snippet" onClick={onClose}>
                        Close
                    </button>
                )}
            </div>

            <div style={{ padding: '1rem' }}>
                <p className="sdk-snippet-note" style={{ marginTop: 0, marginBottom: '0.9rem' }}>
                    Resolves minified stack frames back to original source on the group detail page — display only, doesn't affect error grouping. <code>filename</code> must match the minified bundle name a stack frame actually references (e.g. <code>app.min.js</code>), not the map file's own name.
                </p>

                <form onSubmit={handleUpload} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
                    <div style={{ flex: '1 1 160px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                            Bundle filename
                        </label>
                        <input
                            type="text"
                            placeholder="app.min.js"
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            disabled={uploading}
                        />
                    </div>
                    <div style={{ flex: '1 1 120px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                            Release (optional)
                        </label>
                        <input
                            type="text"
                            placeholder="v1.4.2"
                            value={release}
                            onChange={(e) => setRelease(e.target.value)}
                            disabled={uploading}
                        />
                    </div>
                    <div style={{ flex: '1 1 200px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                            Map file (.map, JSON)
                        </label>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".map,application/json"
                            onChange={handleFileChange}
                            disabled={uploading}
                        />
                    </div>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={uploading}>
                        <UploadCloud size={13} />
                        {uploading ? 'Uploading…' : 'Upload'}
                    </button>
                </form>

                {uploadError && (
                    <p style={{ color: 'var(--critical)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{uploadError}</p>
                )}
                {uploadSuccess && (
                    <p style={{ color: 'var(--success, var(--accent))', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{uploadSuccess}</p>
                )}

                {loading ? (
                    <div className="skeleton" style={{ width: '100%', height: '40px', borderRadius: 'var(--radius-md)' }} />
                ) : loadError ? (
                    <p style={{ color: 'var(--critical)', fontSize: '0.8rem' }}>{loadError}</p>
                ) : sourceMaps.length === 0 ? (
                    <div className="empty-state-compact">
                        <span className="empty-state-compact-title">No source maps uploaded yet</span>
                        <span className="empty-state-compact-desc">Upload one above, or wire it into your build/CI step using this project's API key — see the API docs.</span>
                    </div>
                ) : (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Filename</th>
                                    <th style={{ width: '120px' }}>Release</th>
                                    <th style={{ width: '110px' }}>Uploaded</th>
                                    <th style={{ width: '50px' }} />
                                </tr>
                            </thead>
                            <tbody>
                                {sourceMaps.map((m) => (
                                    <tr key={m.id}>
                                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{m.filename}</td>
                                        <td>
                                            {m.release ? (
                                                <span className="badge-release">{m.release}</span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                                            )}
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                            {formatRelativeTime(m.uploadedAt)}
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                className="btn btn-danger btn-sm"
                                                onClick={() => handleDelete(m.id)}
                                                disabled={deletingId === m.id}
                                                title="Delete this source map"
                                                aria-label={`Delete source map ${m.filename}`}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default SourceMapManager;
