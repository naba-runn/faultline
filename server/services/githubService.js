// server/services/githubService.js
//
// Task 12 scope: fetch a source file from GitHub's Contents API to
// ground the AI enrichment prompt. Best-effort — any failure (no repo
// configured, invalid format, 404, rate limit, network error) returns
// null rather than throwing, per AI_CONTEXT.md's resilience contract.
// Correlating this to a specific stack frame (which file/line to ask
// for) is Task 13's job, not this file's — this module just answers
// "given a repo + path + line, what's the relevant snippet."

const config = require('../config/env');

// Re-validated here even though Project.js's schema already enforces
// this shape (Task 5) — belt-and-suspenders per AI_CONTEXT.md: this
// value is only ever allowed to become a path segment against the
// fixed api.github.com host, never a user-supplied URL. Never trust a
// value at the point it's used to build an outbound request, even if
// something upstream already validated it.
const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

const DEFAULT_CONTEXT_LINES = 15;

function extractSnippet(fileContent, targetLine, contextLines = DEFAULT_CONTEXT_LINES) {
  if (!fileContent || typeof fileContent !== 'string') return '';
  if (!Number.isInteger(targetLine) || targetLine < 1) return fileContent;

  const lines = fileContent.split('\n');
  const startIdx = Math.max(0, targetLine - 1 - contextLines);
  const endIdx = Math.min(lines.length, targetLine + contextLines);

  return lines
    .slice(startIdx, endIdx)
    .map((line, i) => `${startIdx + i + 1}: ${line}`)
    .join('\n');
}

async function fetchCodeSnippet({ githubRepo, filePath, line }) {
  if (!githubRepo || !REPO_PATTERN.test(githubRepo)) {
    return null;
  }
  if (!filePath || typeof filePath !== 'string') {
    return null;
  }

  const [owner, repo] = githubRepo.split('/');
  const cleanPath = filePath.replace(/^\/+/, '');
  const encodedPath = cleanPath
    .split('/')
    .map(encodeURIComponent)
    .join('/');

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`;

  const headers = {
    Accept: 'application/vnd.github.raw',
    'User-Agent': 'faultline-app',
  };
  if (config.githubToken) {
    headers.Authorization = `Bearer ${config.githubToken}`;
  }

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.warn(
        `[githubService] fetch failed for ${githubRepo}/${cleanPath}: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const fileContent = await response.text();
    return extractSnippet(fileContent, line);
  } catch (err) {
    console.error(`[githubService] request error for ${githubRepo}/${cleanPath}:`, err.message);
    return null;
  }
}

module.exports = { fetchCodeSnippet, extractSnippet };