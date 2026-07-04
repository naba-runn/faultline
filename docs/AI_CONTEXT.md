# Faultline — AI Integration Context

**Status: Task 11 done** (`buildPrompt`/`callGemini`/`parseAndValidate`
in `server/services/aiService.js`). Tasks 12–14 (GitHub fetch, wiring
into ingestion, derived confidence/affectedFile/affectedFunction)
remain. This file exists so the design decisions from the architecture
review survive even if implementation happens in a different session.

**Known doc gap:** the `confidence` description below (`"high"`/
`"low"` strings) doesn't match `ErrorGroup.js`'s actual
`aiSummarySchema` (`Number, min: 0, max: 1`, locked in Task 9.1). Not
yet reconciled — see DECISIONS.md's Task 11 entry. Fix this before
Task 14 assigns a value to `confidence`.

## Role of AI in This System

Enrichment, not product. Triggered exactly once per new error group
(never per event, never user-facing as a chat interface). If the AI
call fails, ingestion must never fail because of it.

## Pipeline (to implement in Tasks 11–14)

1. Parse the stack trace, extract the top application frame (file + line).
2. If `project.githubRepo` is set, fetch that file via GitHub's
   Contents API. `githubRepo` must be validated against
   `^[\w.-]+\/[\w.-]+$` and only ever used as a path segment against
   the fixed `api.github.com` host — never as a user-supplied URL.
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

- **`confidence`**: `"high"` if the GitHub file fetch succeeded and was
  included in the prompt, `"low"` if enrichment fell back to
  stack-trace-only. LLM self-reported confidence is not reliably
  calibrated, so we don't ask for it.
- **`affectedFile` / `affectedFunction`**: derived from the parsed top
  stack frame, not restated by the model.

## Dispatch Model

AI enrichment is **fire-and-forget**, kicked off after the ingestion
HTTP response has already been sent. It is never `await`-ed inside the
request/response cycle. This is a deliberate fix to keep ingestion
latency independent of LLM latency, without needing queue
infrastructure (BullMQ/Redis) at MVP scale — that's the named next
step if this needs to scale further, not something to build now.

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