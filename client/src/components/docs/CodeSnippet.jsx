import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export default function CodeSnippet({ code, language = 'javascript' }) {
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
