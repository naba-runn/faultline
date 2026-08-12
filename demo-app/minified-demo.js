// demo-app/minified-demo.js
//
// Task 32 demo script: demonstrates uploading a source map and sending a minified error event.
// Run with: node minified-demo.js <PROJECT_ID> <API_KEY> [API_URL]
// E.g.: node minified-demo.js 66b9f... flt_1915... http://localhost:5050

const projectId = process.argv[2];
const apiKey = process.argv[3];
const apiUrl = process.argv[4] || 'http://localhost:5050';

if (!projectId || !apiKey) {
  console.log('Usage: node minified-demo.js <PROJECT_ID> <API_KEY> [API_URL]');
  console.log('Example: node minified-demo.js 66b9f... flt_1915... http://localhost:5050');
  process.exit(1);
}

// Hand-crafted Source Map v3 that maps `app.min.js:1:25` to `src/utils/calculator.js:14:8` (`addNumbers`)
const sampleSourceMap = {
  version: 3,
  sources: ['src/utils/calculator.js'],
  names: ['addNumbers'],
  mappings: 'yBAaQA',
  file: 'app.min.js',
};

async function run() {
  console.log(`[minified-demo] Target server: ${apiUrl}`);
  console.log(`[minified-demo] Uploading source map for app.min.js...`);

  // 1. Upload Source Map via API Key authentication
  const mapRes = await fetch(`${apiUrl}/api/projects/${projectId}/sourcemaps`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      filename: 'app.min.js',
      release: 'v1.4.2',
      map: sampleSourceMap,
    }),
  });

  const mapData = await mapRes.json();
  if (!mapRes.ok) {
    console.error('[minified-demo] Failed to upload source map:', mapData);
    process.exit(1);
  }
  console.log('[minified-demo] Source map uploaded successfully:', mapData.data);

  // 2. Send Minified Error Event
  console.log('[minified-demo] Ingesting minified error event...');
  const eventRes = await fetch(`${apiUrl}/api/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      message: 'TypeError: Cannot read properties of null (reading "value")',
      stack: 'at a (app.min.js:1:25)\n at b (app.min.js:1:50)',
      env: 'production',
      release: 'v1.4.2',
      metadata: { demo: 'task-32-sourcemap' },
    }),
  });

  const eventData = await eventRes.json();
  if (!eventRes.ok) {
    console.error('[minified-demo] Failed to ingest event:', eventData);
    process.exit(1);
  }
  console.log('[minified-demo] Event ingested successfully:', eventData.data);
  console.log(`\n[minified-demo] Done! Open group detail page: http://localhost:5173/groups/${eventData.data.errorGroupId}`);
}

run().catch((err) => {
  console.error('[minified-demo] Error:', err);
});
