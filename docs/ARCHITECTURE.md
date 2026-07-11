# Faultline — AI Integration Context

**Status: Tasks 11–14 done, dispatch model updated in Task 25**
(`aiService.js`'s pure functions + `callGemini`; `githubService.js`'s
Contents API fetch; Task 13 wired both into
`errorGroupService.enrichErrorGroup`; Task 14 added the three
server-derived fields below; Task 25 moved dispatch from a direct
fire-and-forget call to a BullMQ job queue consumed by a separate
`worker.js` process — see the Dispatch Model section below). This file
exists so the design decisions from the architecture review survive
even if implementation happens in a different session.

**Doc gap resolved (this pass):** the `confidence` description below
now correctly matches `ErrorGroup.js`'s `aiSummarySchema` (`Number,
min: 0, max: 1`, locked in Task 9.1). Previously this file described
`confidence` as `"high"`/`"low"` strings — flagged across three files
over multiple sessions and never actually corrected until now. See
`DECISIONS.md`'s "aiService: package and model choice" entry.
`confidence` is now computed — see "Fields Derived Server-Side" below.

## Role of AI in This System

Enrichment, not product. Triggered exactly once per new error group
(never per event, never user-facing as a chat interface). If the AI
call fails, ingestion must never fail because of it.

## Pipeline (implemented across Tasks 11–14)

1. Parse the stack trace, extract the top application frame (file + line).
2. If `project.githubRepo` is set, fetch that file via GitHub's
   Contents API. `githubRepo` must be validated against
   `^[\w.-]+\/[\w.-]+$` and only ever used as a path segment against
   the fixed `api.github.com` host — never as a user-supplied URL.
   **Implemented in `githubService.fetchCodeSnippet()`** — returns a
   windowed snippet (±15 lines around the target line, not the whole
   file) or `null` on any failure (no repo configured, invalid format,
   404, rate limit, network error). Re-validates the regex itself even
   though `Project.js`'s schema already enforces it — never trust a
   value at the point it's used to build an outbound request.
docs/DECISIONS.md — new entry appended
3. `buildPrompt(context)` — pure function, constructs the prompt from
   error message + stack + (optional) code snippet. Unit-testable with
   no network call.
4. `callGemini(prompt)` — thin wrapper around the SDK call, JSON
   response-schema mode: `{ rootCause, severity, suggestedFix[] }`.
5. `parseAndValidate(rawResponse)` — pure function, validates shape
   before anything is saved. On failure, or on AI/GitHub outage, save
   the group with `aiSummary: null` and continue.

## Fields Derived Server-Side, Not From the LLM

These are computed in code, not asked of the model — do not change
this without updating this doc and explaining why:

- **`confidence`**: a `Number` in `[0, 1]` (matching
  `ErrorGroup.js`'s `aiSummarySchema`), derived from whether the
  GitHub file fetch succeeded and was included in the prompt (higher)
  vs. enrichment falling back to stack-trace-only (lower). LLM
  self-reported confidence is not reliably calibrated, so we don't ask
  for it. **Implemented in Task 14** as a binary value, not a
  continuous score: `0.8` when a snippet was fetched and grounded the
  prompt, `0.4` when it wasn't (no `githubRepo` configured, no parsed
  top frame, or the GitHub fetch failed) — see
  `errorGroupService.enrichErrorGroup` and `DECISIONS.md`'s "Task 14:
  confidence values and affectedFile/affectedFunction source".
- **`affectedFile` / `affectedFunction`**: derived from the parsed top
  stack frame, not restated by the model. **Implemented in Task 14**:
  taken directly from `stackNormalizer.normalizeStack(stack).frames[0]`
  (`.file` / `.functionName`) — both saved as `null` if the stack
  didn't parse into any frames at all.

## Dispatch Model

**Updated in Task 25** — see `DECISIONS.md`'s "Task 25" entry for the
full reasoning. Originally (Tasks 11-24): AI enrichment was
fire-and-forget, kicked off after the ingestion HTTP response had
already been sent, never `await`-ed inside the request/response cycle.
That was a deliberate choice to keep ingestion latency independent of
LLM latency without needing queue infrastructure at MVP scale — and
this section said, at the time, that BullMQ/Redis was "the named next
step if this needs to scale further, not something to build now."
Task 25 is that step.

As of Task 25: `ingestController` and `projectController.simulateError`
enqueue a BullMQ job (`services/enrichmentQueue.js`) instead of calling
`enrichErrorGroup` directly. The actual AI call happens in a separate
process (`worker.js`, its own Render Background Worker service in
deployment) that consumes the queue. Ingestion latency is still
independent of LLM latency — enqueueing is a fast Redis write, not the
AI call itself — but enrichment failures are now retried (3 attempts,
exponential backoff) instead of being silently swallowed, since a
thrown error from a BullMQ job processor is what triggers a retry.
`errorGroupService.enrichErrorGroup`'s doc comment has the full
retryable-vs-terminal-failure breakdown (a Gemini network/API failure
is retried; a Gemini response that fails our own validation is not,
since retrying an identical prompt against identical input won't
produce a different result).

## Explicitly Rejected Designs (don't rebuild these)

- **4-layer `AIService → GeminiProvider → PromptBuilder →
  ResponseParser` class hierarchy.** Over-abstracted for one provider,
  one call site. Use pure functions inside `aiService` instead.
- **"Likely regression points" field.** Would require a second GitHub
  API call (commit history / git blame), turning this into a
  multi-tool pipeline and undermining the "not a full agent" design
  argument. Left in Production Improvements only.
- **LangChain / vector DB / agent framework.** No multi-turn reasoning
  or dynamic tool selection exists in this problem — a single
  tool-augmented generation call is the right scope.

## Data Minimization

The raw source snippet fetched from GitHub is used in the prompt and
then **discarded** — never persisted to `ErrorGroup` or `ErrorEvent`.
Only the AI's derived summary is stored.