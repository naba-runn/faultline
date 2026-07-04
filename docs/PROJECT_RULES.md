# Faultline — Project Rules

**This document is the constitution.** It defines how any Claude
session — new or continuing — is expected to think and behave while
working on Faultline. It changes rarely, only on deliberate amendment
(§13). Everything that changes session-to-session lives in
`STATUS.md` instead.

> **Amendment note (this pass):** this file was rewritten from ~520
> lines to this version as a deliberate, owner-authorized
> documentation re-engineering pass, not casual editing of the
> constitution. Rationale: the prior doc-to-code ratio (~2,850 doc
> lines against ~1,520 code lines at only 12/24 tasks complete) was
> disproportionate for a solo contributor, and the old `HANDOFF.md`
> regenerate-from-scratch mechanism had already produced two observed
> bugs (a self-contradicting status line, two leaked diff markers).
> The formal `PENDING_RECOVERY`/`BOOTSTRAP_PROMPT` machinery and the
> session-scoped-preferences system (old §9–§13) are cut or compressed
> below — they were solving a real problem (resuming across memoryless
> sessions) with more process ceremony than a team of one needs. See
> `DECISIONS.md`'s Shipped Log for this pass's full change list.

Read order for a new session: **this file → `STATUS.md` →
`TASKS.md`.** Everything else is reference material, consulted on
demand (§3).

---

## 1. Project Philosophy

Faultline is an AI-grounded error intelligence platform — a
scoped-down Sentry. Client apps POST runtime errors to an ingestion
API; Faultline deduplicates them by stack-trace fingerprint, and, on
the *first* occurrence of a new error group only, fetches the
offending source file from GitHub and calls Gemini for a structured
root-cause summary.

- **AI is a backend enrichment step, not the product.** It runs once
  per new error group, fire-and-forget, and its failure must never
  break ingestion. If a design conversation starts treating the LLM as
  a chat interface, an agent, or an always-on reasoning loop, that's
  drifting outside the approved architecture — stop and flag it.
- **This is a portfolio-grade MVP, not a production SaaS.** Scope is
  deliberately bounded (`ARCHITECTURE.md`'s "Deliberate Non-Choices",
  `AI_CONTEXT.md`'s "Explicitly Rejected Designs"). Correct-but-
  premature ideas (queues, provider abstraction layers, agent
  frameworks) get written down as named future steps, not built now.

## 2. Engineering Philosophy

- **Correctness and clarity over speed.** Built to be read, reasoned
  about, and explained in an interview — never trade architecture for
  velocity.
- **Small, verifiable increments.** One subtask (~15–30 min of focused
  work) at a time, fully implemented and manually verified before the
  next starts.
- **No silent scope creep.** Don't add fields, endpoints, retries,
  abstractions, or "while I'm in here" improvements that weren't asked
  for. Propose them; don't implement them unprompted.
- **Code is ground truth for what exists. `DECISIONS.md`/
  `ARCHITECTURE.md` are ground truth for why.** A mismatch between
  them is a bug in one of the two — surface it, don't silently defer
  to whichever you read first.
- **Honesty over reassurance.** If a manual test wasn't run, say so.
  `STATUS.md` is only useful if it's trustworthy.

## 3. Documentation System Overview

| Tier | Question it answers | Files | Update cadence |
|---|---|---|---|
| **0 — Constitution** | "How do I behave?" | `PROJECT_RULES.md` | Almost never |
| **1 — Live state** | "Where are we, right now?" | `STATUS.md` | Every session/subtask boundary, **edited in place** |
| **2 — Reference** | "How does this part work, and why?" | `TASKS.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, `AI_CONTEXT.md`, `DECISIONS.md`, `README.md` | Only when that specific concern changes |

`STATUS.md` is the single Tier-1 file (replacing the old
`PROJECT_CONTEXT.md`/`HANDOFF.md` pair) — edited in place, never
regenerated wholesale. It must stay self-contained enough that a new
session can resume from `PROJECT_RULES.md` + `STATUS.md` alone. It
contains: current milestone/task (by reference to `TASKS.md`'s
numbering, not restated), what's actively in progress, known open
issues, and a pointer list of currently-relevant decisions (link to
`DECISIONS.md` by title, don't restate content).

`DECISIONS.md` now also absorbs what used to be `CHANGELOG.md` and
`INTERVIEW_NOTES.md`: each decision entry may carry optional
**"Shipped"** (what/when) and **"Likely interview questions"**
sub-sections. Changes with no interesting decision behind them (pure
bugfixes, doc corrections) go in `DECISIONS.md`'s chronological
**"Shipped Log"** at the bottom instead.

## 4. Development Workflow

1. Confirm the next subtask against `TASKS.md` and `STATUS.md`.
2. Implement exactly that subtask — nothing upstream or downstream.
3. Provide manual test instructions (or run them yourself if
   explicitly permitted for that piece of work).
4. Update only the documentation whose content actually changed.
5. Provide a suggested git commit (§9).
6. Stop. State the subtask is done per the Definition of Done (§8).

Never batch multiple subtasks into one turn, even if trivially small,
unless explicitly told otherwise for that session.

## 5. Implementation Workflow

- Never redesign the approved architecture. `ARCHITECTURE.md`'s
  layering convention and `AI_CONTEXT.md`'s pipeline are locked.
- Never recreate work that already exists — check `STATUS.md` and the
  actual repo before writing a file.
- Never silently overwrite existing code without saying so and why.
- Follow the layering convention without exception: controllers never
  touch Mongoose directly; services never touch `req`/`res`; models
  hold schemas only. (`authMiddleware`'s own DB lookup is the one
  documented exception — don't "fix" it.)

## 6. Documentation Responsibilities

One line of law per file:

- **`PROJECT_RULES.md`** — the constitution. Changes only via §13.
- **`STATUS.md`** — where things stand right now, edited in place.
- **`TASKS.md`** — the immutable-order checklist; check boxes off, never reorder.
- **`API.md`** — endpoint contracts; update only when a contract changes.
- **`DATABASE.md`** — schema/index reference, split Implemented/Planned.
- **`ARCHITECTURE.md`** — folder structure, layering, request flow, Deliberate Non-Choices.
- **`AI_CONTEXT.md`** — AI pipeline design rationale, Explicitly Rejected Designs.
- **`DECISIONS.md`** — ADR-style log (decision/alternatives/justification), plus Shipped/interview sub-sections and the Shipped Log.
- **`README.md`** — user-facing front door only; never internal workflow/status detail.

## 7. Resuming Work

Read `PROJECT_RULES.md` → `STATUS.md` → `TASKS.md`, then start. If a
prior session ended mid-task, that fact lives in `STATUS.md`'s own
"What's Actively In Progress" text — there is no separate recovery-
block taxonomy to consult. If `STATUS.md` doesn't clearly say what's
in flight, treat the next unchecked `TASKS.md` box as the starting
point and confirm before proceeding.

## 8. Definition of Done

A subtask is complete only when:

- ✓ Code implemented, matching the locked architecture
- ✓ Manual testing completed (or explicit instructions handed off)
- ✓ Only the documentation files whose content actually changed were updated
- ✓ `STATUS.md` doesn't contradict itself and matches `TASKS.md`'s checkbox state (the Tier-1 consistency check — do this before marking anything done; this is the direct fix for the drift that motivated this pass)
- ✓ A suggested git commit provided (§9)

## 9. Git Workflow

- One subtask, one suggested commit: `<type>(<task>): <summary>`.
- Claude suggests the commit message; running it is the user's call.
- Commits are not assumed pushed — `STATUS.md` distinguishes
  "committed" from "pushed" when it matters, never assumes either.
- Don't bundle unrelated changes into one commit for convenience.

## 10. Teaching Expectations

- Briefly explain non-obvious decisions inline while implementing — a
  sentence or two, not a lecture.
- Substantive rationale belongs in `DECISIONS.md`. Interview-framed
  rationale belongs in `DECISIONS.md`'s "Likely interview questions"
  sub-section, written after the feature is complete.

## 11. Code Quality Standards

- Modular architecture, strict separation of concerns (§5).
- Reusable, composable functions over one-off inline logic.
- Plain try/catch is correct and expected everywhere until Task 20's
  `AppError`/`catchAsync` refactor lands — don't "fix" this early,
  don't flag it as a bug.
- Security is non-negotiable at every layer: hashed credentials,
  constant-time comparisons where an actual timing side-channel
  exists, ownership-scoped queries (not fetch-then-check), input
  validation at trust boundaries. See `DECISIONS.md` for the
  rationale behind each choice already made — extend the pattern,
  don't re-derive it.
- Premature abstraction is a defect, not a virtue, on this project —
  see `ARCHITECTURE.md`'s "Deliberate Non-Choices."

## 12. Code Review Expectations

When a review is requested, review as a Staff Software Engineer
would: correctness, architecture, security, scalability, readability,
maintainability. Be technically honest — don't soften or omit real
weaknesses to be agreeable.

## 13. Conflict Resolution & Amendment Policy

- **Docs vs. code:** running code is ground truth for what exists.
  `DECISIONS.md`/`ARCHITECTURE.md` are ground truth for what the
  design is supposed to be. A mismatch is a bug to surface explicitly.
- **Doc vs. doc:** `DECISIONS.md` wins on *why*; the most recently
  updated file wins on *current state* — but treat disagreement as a
  documentation bug to fix, not just route around.
- **Amending this constitution:** only when the user explicitly asks
  to change the workflow itself (not when asking for implementation
  work). Edit the specific section in place; note the change in
  `STATUS.md`. Routine implementation sessions never modify this file.
- **Audit cadence:** every 10 completed tasks, one session's sole job
  is re-verifying prior "DONE" claims against actual code/tests before
  continuing implementation.
