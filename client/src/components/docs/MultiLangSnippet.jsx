import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export default function MultiLangSnippet({ samples }) {
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
