// server/services/aiService.js
//
// Task 11 scope only: buildPrompt / callGemini / parseAndValidate.
// Does NOT fetch GitHub source (Task 12), does NOT wire into the
// ingestion "new group" path (Task 13), and does NOT compute
// confidence/affectedFile/affectedFunction (Task 14, derived
// server-side per AI_CONTEXT.md — never asked of the model). This
// file's output is exactly { rootCause, severity, suggestedFix }.
//
// Task 41.3 adds a second, deliberately separate prompt/call/validate
// trio (buildIncidentDiagnosisPrompt / callGeminiText /
// validateIncidentHypothesis) for incident diagnosis — a different
// question ("what likely connects these events") with a different
// answer shape (one free-form paragraph, not structured JSON), so it
// does not reuse callGemini's RESPONSE_SCHEMA/parseAndValidate at all
// rather than forcing an artificial fit onto the error-enrichment
// schema.

const { GoogleGenAI } = require('@google/genai');
const config = require('../config/env');

const MODEL = 'gemini-2.5-flash';

const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    rootCause: { type: 'string' },
    severity: { type: 'string', enum: VALID_SEVERITIES },
    suggestedFix: { type: 'array', items: { type: 'string' } },
  },
  required: ['rootCause', 'severity', 'suggestedFix'],
};

function buildPrompt({ message, stack, codeSnippet }) {
  const snippetSection = codeSnippet
    ? `\n\nRelevant source code (top stack frame):\n\`\`\`\n${codeSnippet}\n\`\`\``
    : '\n\n(No source code available — stack-trace-only analysis.)';

  return `You are analyzing a production error for a software engineering team.

Error message: ${message}

Stack trace:
${stack}${snippetSection}

Provide:
1. A concise root cause explanation (1-3 sentences).
2. A severity rating: low, medium, high, or critical.
3. A short list of concrete suggested fixes (1-4 items).

Base your analysis only on the information given above. Do not
speculate about parts of the codebase you cannot see.`;
}

let client = null;
function getClient() {
  if (!client) {
    client = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return client;
}

async function callGemini(prompt) {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });
  return response.text;
}

function parseAndValidate(rawResponse) {
  let parsed;
  try {
    parsed = JSON.parse(rawResponse);
  } catch (err) {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  if (typeof parsed.rootCause !== 'string' || !parsed.rootCause.trim()) return null;
  if (!VALID_SEVERITIES.includes(parsed.severity)) return null;
  if (
    !Array.isArray(parsed.suggestedFix) ||
    parsed.suggestedFix.length === 0 ||
    !parsed.suggestedFix.every((fix) => typeof fix === 'string' && fix.trim())
  ) {
    return null;
  }

  return {
    rootCause: parsed.rootCause,
    severity: parsed.severity,
    suggestedFix: parsed.suggestedFix,
  };
}

// Task 41.3: builds the incident-diagnosis prompt from affected
// groups' own (already-derived) summaries plus the triggering
// deployment's commit metadata, when there is one — a spike-triggered
// incident has no deployment, so that section is omitted rather than
// printed as "unknown."
function buildIncidentDiagnosisPrompt({ affectedGroups, deployment }) {
  const groupsSection = affectedGroups
    .map((g, i) => {
      const parts = [`${i + 1}. "${g.message}"`];
      if (g.severity) parts.push(`severity: ${g.severity}`);
      if (g.rootCause) parts.push(`known root cause: ${g.rootCause}`);
      return parts.join(' — ');
    })
    .join('\n');

  const deploymentSection = deployment
    ? `\n\nTriggering deployment: commit ${deployment.sha}${deployment.ref ? ` on ${deployment.ref}` : ''}, deployed at ${deployment.deployedAt}.`
    : '';

  return `You are investigating a production incident for a software engineering team.

Affected error groups:
${groupsSection}${deploymentSection}

Write a single, concise paragraph (3-5 sentences) hypothesizing what
most likely connects these errors, and — only if a deployment is named
above — whether it plausibly caused them. Base your hypothesis only on
the information given above. Do not speculate about parts of the
codebase you cannot see, and do not simply repeat the error messages
verbatim.`;
}

// Free-form text generation — deliberately no responseSchema/
// responseMimeType (unlike callGemini above), since the incident
// hypothesis is one paragraph of prose, not a JSON object to validate
// against a fixed shape.
async function callGeminiText(prompt) {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
  });
  return response.text;
}

function validateIncidentHypothesis(rawResponse) {
  if (typeof rawResponse !== 'string') return null;
  const trimmed = rawResponse.trim();
  if (!trimmed) return null;
  return trimmed;
}

module.exports = {
  buildPrompt,
  callGemini,
  parseAndValidate,
  buildIncidentDiagnosisPrompt,
  callGeminiText,
  validateIncidentHypothesis,
};