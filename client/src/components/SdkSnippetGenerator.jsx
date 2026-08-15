import { useState } from 'react';

const FAULTLINE_API_ENDPOINT =
    import.meta.env.VITE_FAULTLINE_API_URL || 'http://localhost:5050/api/events';

function getSnippets() {
    return {
        node: `// Node.js / Express HTTP Integration
// Install: none (uses native fetch in Node 18+)
const FAULTLINE_API_KEY = process.env.FAULTLINE_API_KEY || '<YOUR_API_KEY>';
const FAULTLINE_API_URL = process.env.FAULTLINE_API_URL || '${FAULTLINE_API_ENDPOINT}';

async function reportErrorToFaultline(error, release = '1.0.0') {
  if (!FAULTLINE_API_KEY || FAULTLINE_API_KEY === '<YOUR_API_KEY>') return;
  try {
    await fetch(FAULTLINE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${FAULTLINE_API_KEY}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        env: process.env.NODE_ENV || 'production',
        release: release,
        metadata: { source: 'backend-api' },
      }),
    });
  } catch (err) {
    console.error('Failed to report error to Faultline:', err.message);
  }
}

// Express error-handling middleware (place after routes)
app.use((err, req, res, next) => {
  reportErrorToFaultline(err);
  res.status(500).json({ error: 'Internal Server Error' });
});`,
        curl: `# HTTP / cURL Integration
curl -X POST ${FAULTLINE_API_ENDPOINT} \\
  -H "Authorization: Bearer <YOUR_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "TypeError: Cannot read properties of undefined (reading '\''x'\'')",
    "stack": "TypeError: Cannot read properties of undefined\\n    at checkout (/app/src/cart.js:42:15)",
    "env": "production",
    "release": "v1.0.0",
    "metadata": { "userId": "usr_123" }
  }'`,
        python: `# Python (HTTP requests example)
# Install: pip install requests
import os
import requests

FAULTLINE_API_KEY = os.getenv("FAULTLINE_API_KEY", "<YOUR_API_KEY>")
FAULTLINE_API_URL = os.getenv("FAULTLINE_API_URL", "${FAULTLINE_API_ENDPOINT}")

def report_error_to_faultline(error, release="1.0.0"):
    if not FAULTLINE_API_KEY or FAULTLINE_API_KEY == "<YOUR_API_KEY>":
        return
    payload = {
        "message": str(error),
        "stack": str(getattr(error, "__traceback__", error)),
        "env": os.getenv("ENV", "production"),
        "release": release,
        "metadata": {"source": "python-app"},
    }
    try:
        requests.post(
            FAULTLINE_API_URL,
            headers={
                "Authorization": f"Bearer {FAULTLINE_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=5,
        )
    except Exception as e:
        print(f"Failed to report error to Faultline: {e}")`,
    };
}

function SdkSnippetGenerator({ projectName }) {
    const [activeTab, setActiveTab] = useState('node');
    const [copied, setCopied] = useState(false);

    const snippets = getSnippets();
    const activeSnippet = snippets[activeTab] || snippets.node;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(activeSnippet);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = activeSnippet;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="sdk-snippet-container">
            <div className="sdk-snippet-header">
                <div className="sdk-snippet-tabs">
                    <button
                        type="button"
                        className={`sdk-tab ${activeTab === 'node' ? 'active' : ''}`}
                        onClick={() => setActiveTab('node')}
                    >
                        Node.js / Express
                    </button>
                    <button
                        type="button"
                        className={`sdk-tab ${activeTab === 'curl' ? 'active' : ''}`}
                        onClick={() => setActiveTab('curl')}
                    >
                        HTTP / cURL
                    </button>
                    <button
                        type="button"
                        className={`sdk-tab ${activeTab === 'python' ? 'active' : ''}`}
                        onClick={() => setActiveTab('python')}
                    >
                        Python (HTTP)
                    </button>
                </div>
                <button
                    type="button"
                    className="btn-copy-snippet"
                    onClick={handleCopy}
                >
                    {copied ? 'Copied' : 'Copy snippet'}
                </button>
            </div>

            <pre className="sdk-code-block">
                <code>{activeSnippet}</code>
            </pre>
            <p className="sdk-snippet-note">
                Ingestion endpoint: <code>{FAULTLINE_API_ENDPOINT}</code> with <code>Authorization: Bearer &lt;API_KEY&gt;</code>. Required: <code>message</code>, <code>stack</code>. Optional: <code>env</code>, <code>release</code>, <code>metadata</code>.
            </p>
        </div>
    );
}

export default SdkSnippetGenerator;
