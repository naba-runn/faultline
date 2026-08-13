import { useState } from 'react';

const API_ENDPOINT = 'http://localhost:5050/api/events';

function getSnippets(apiKey) {
    const keyStr = apiKey || '<YOUR_API_KEY>';
    return {
        curl: `curl -X POST ${API_ENDPOINT} \\
  -H "Authorization: Bearer ${keyStr}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "Error: Failed to process payment",
    "stack": "Error: Failed to process payment\\n    at checkout (/app/src/cart.js:42:15)",
    "env": "production",
    "release": "v1.0.0"
  }'`,
        node: `// Node.js / Express Integration
async function reportErrorToFaultline(error, release = 'v1.0.0') {
  try {
    await fetch('${API_ENDPOINT}', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ${keyStr}',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        env: process.env.NODE_ENV || 'production',
        release: release,
      }),
    });
  } catch (err) {
    console.error('Failed to report error to Faultline:', err);
  }
}`,
        python: `# Python Integration
import requests
import os

def report_error_to_faultline(error, release="v1.0.0"):
    payload = {
        "message": str(error),
        "stack": str(getattr(error, "__traceback__", error)),
        "env": os.getenv("ENV", "production"),
        "release": release,
    }
    try:
        requests.post(
            "${API_ENDPOINT}",
            headers={
                "Authorization": "Bearer ${keyStr}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=5,
        )
    except Exception as e:
        print(f"Failed to report error to Faultline: {e}")`,
    };
}

function SdkSnippetGenerator({ apiKey, projectName }) {
    const [activeTab, setActiveTab] = useState('curl');
    const [copied, setCopied] = useState(false);

    const snippets = getSnippets(apiKey);
    const activeSnippet = snippets[activeTab] || snippets.curl;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(activeSnippet);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for environments without navigator.clipboard
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
                        className={`sdk-tab ${activeTab === 'curl' ? 'active' : ''}`}
                        onClick={() => setActiveTab('curl')}
                    >
                        cURL
                    </button>
                    <button
                        type="button"
                        className={`sdk-tab ${activeTab === 'node' ? 'active' : ''}`}
                        onClick={() => setActiveTab('node')}
                    >
                        Node.js
                    </button>
                    <button
                        type="button"
                        className={`sdk-tab ${activeTab === 'python' ? 'active' : ''}`}
                        onClick={() => setActiveTab('python')}
                    >
                        Python
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
            {projectName && (
                <p className="sdk-snippet-note">
                    Send events for <strong>{projectName}</strong> to <code>{API_ENDPOINT}</code> using Bearer header authentication.
                </p>
            )}
        </div>
    );
}

export default SdkSnippetGenerator;
