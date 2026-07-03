# Faultline — Project Rules

**This document is the constitution.** It defines how any Claude
session — new or continuing — is expected to think and behave while
working on Faultline. It changes rarely, and only on deliberate
amendment (see §21). Everything that changes session-to-session lives
elsewhere. If you are a fresh Claude session with zero prior context,
reading this file alone should tell you exactly how to conduct
yourself, even before you look at a single line of code.

Read order for a new session: **this file → `HANDOFF.md` →
`PROJECT_CONTEXT.md` → `TASKS.md`**. Everything else is reference
material, consulted on demand (§8).

---

## 1. Project Philosophy

Faultline is an AI-grounded error intelligence platform — a
scoped-down Sentry. Client apps POST runtime errors to an ingestion
API; Faultline deduplicates them by stack-trace fingerprint, and, on
the *first* occurrence of a new error group only, fetches the
offending source file from GitHub and calls Gemini for a structured
root-cause summary.

Two things follow from that scope, and both are permanent:

- **AI is a backend enrichment step, not the product.** It runs once
  per new error group, fire-and-forget, and its failure must never
  break ingestion. If a design conversation starts treating the LLM as
  a chat interface, an agent, or a always-on reasoning loop, that
  conversation is drifting outside the approved architecture — stop
  and flag it rather than build it.
- **This is a portfolio-grade MVP, not a production SaaS.** Scope is
  deliberately bounded (see the "Deliberate Non-Choices" in
  `ARCHITECTURE.md` and the "Explicitly Rejected Designs" in
  `AI_CONTEXT.md`). Ideas that are correct-but-premature (queues,
  provider abstraction layers, agent frameworks) get written down as
  *named future steps*, not built now. Restraint is a feature of this
  project, not a gap in it.

## 2. Engineering Philosophy

- **Correctness and clarity over speed.** Faultline is built to be
  read, reasoned about, and explained in an interview — not shipped
  under deadline pressure. Never trade architecture for velocity.
- **Small, verifiable increments.** Every unit of work is a subtask
  small enough to fully understand, implement, and manually verify in
  one sitting (~15–30 minutes of focused work). No subtask starts
  until the previous one is confirmed done.
- **No silent scope creep.** Do not add fields, endpoints, retries,
  abstractions, or "while I'm in here" improvements that weren't
  asked for. Propose them; do not implement them unprompted.
- **The codebase is the ground truth for *what exists*. `DECISIONS.md`
  and `ARCHITECTURE.md` are the ground truth for *why it exists this
  way*.** If code and a locked decision ever disagree, that is a bug
  in one of the two — surface it explicitly, do not silently defer to
  whichever one you read first.
- **Honesty over reassurance.** If a manual test wasn't actually run,
  say so. If a status line might be stale, say so. `PROJECT_CONTEXT.md`
  and `HANDOFF.md` are only useful if they are trustworthy; a
  confident-sounding but unverified "DONE" is worse than an honest
  "not yet confirmed."

## 3. Documentation System Overview

Faultline's documentation has three tiers. Confusing which tier a
piece of information belongs in is the single most common way this
system degrades over time — when in doubt, use this section to decide.

| Tier | Question it answers | Files | Update cadence |
|---|---|---|---|
| **0 — Constitution** | "How do I behave?" | `PROJECT_RULES.md` | Almost never |
| **1 — Live state** | "Where are we, right now?" | `PROJECT_CONTEXT.md`, `HANDOFF.md` | Every session / subtask boundary |
| **2 — Reference** | "How does this part work, and why?" | `TASKS.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, `AI_CONTEXT.md`, `DECISIONS.md`, `INTERVIEW_NOTES.md`, `CHANGELOG.md`, `README.md` | Only when that specific concern changes |

Tier 0 and Tier 2 are stable by design — a Tier 2 file changing on
every subtask is a sign something has leaked out of Tier 1. Tier 1 is
the *only* place session-to-session churn is supposed to live, and
even within Tier 1 the two files have distinct jobs that must not
overlap (this is the change this refactor exists to enforce):

- **`PROJECT_CONTEXT.md` is the single source of truth for current
  status.** It is *edited in place* — the current milestone/task/
  subtask lines are updated when they change. It does not get
  rewritten from scratch each session.
- **`HANDOFF.md` is a self-contained state snapshot, regenerated from
  scratch at session boundaries.** Its job is to let a brand-new
  Claude session resume work from this file plus `PROJECT_RULES.md`
  alone — without opening `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, or
  `TASKS.md`. It deliberately restates current status, and locked decisions 
  in condensed form; that overlap is the
  point, not a defect. Only include tree if structure changed this session; 
  otherwise write "no structural changes — see ARCHITECTURE.md.The only thing 
  that never belongs in it is permanent workflow rules — those are identical
  every regeneration and already live in `PROJECT_RULES.md`, so repeating 
  them is the one real waste this refactor removes.

## 4. Development Workflow

The project moves in a strict loop:

1. Confirm the next subtask against `TASKS.md` and the current
   `PROJECT_CONTEXT.md` status line.
2. Implement exactly that subtask. Nothing upstream of it, nothing
   downstream of it.
3. Provide manual test instructions (or, per §15, run them yourself
   only if explicitly permitted for that session).
4. Update only the documentation files whose contents actually
   changed as a result of this subtask (§7–§8).
5. Provide a suggested git commit (§16).
6. Stop. State that the subtask is done per the Definition of Done
   (§14). Wait for confirmation before starting the next one.

Never batch multiple subtasks into one turn, even if they look
trivially small — one subtask, one stop, one confirmation, every
time, unless the user has explicitly said otherwise for that session
(and if so, that override is recorded in `HANDOFF.md`, not assumed to
persist).

## 5. Planning Workflow

Planning happens in the session that has the most context to spend on
it — which is *now*, not later. Concretely:

- When a multi-step task is ahead (a new Milestone, a schema change
  touching several files), think through the shape of the whole thing
  before writing the first line of code, and say so briefly.
- Do not defer design decisions to "figure out when we get there" if
  they're knowable now — that just forces a future, more
  context-constrained session to re-derive them.
- The output of planning is not a separate document. It becomes: the
  subtask breakdown for `TASKS.md`, and/or an entry in `DECISIONS.md`
  if a real design choice was made.
- The next Claude session should be implementing a plan, not
  discovering one.

## 6. Implementation Workflow

- Never redesign the approved architecture. `ARCHITECTURE.md`'s
  layering convention and `AI_CONTEXT.md`'s pipeline are locked;
  implement them, don't re-litigate them.
- Never recreate work that already exists. Check `PROJECT_CONTEXT.md`
  and the actual repo contents before writing a file — if it's marked
  done, verify rather than rewrite.
- Never silently overwrite existing code. If a rewrite is genuinely
  needed, say so and why before doing it.
- Before proposing a fix for a reported bug, ask for the actual
  current file content rather than guessing from the symptom alone.
- Follow the layering convention without exception: controllers never
  touch Mongoose directly; services never touch `req`/`res`; models
  hold schemas only, no business logic. (`authMiddleware`'s own DB
  lookup is the one standing exception, and it's already documented as
  such in `ARCHITECTURE.md` — don't "fix" it.)

## 7. Documentation Policy

Documentation is maintained continuously, but narrowly:

- **Update only the file(s) whose actual content changed.** Do not
  touch a file "for consistency" if nothing in it is factually
  different.
- **Show only the diff, not the whole file**, for every Tier 2 file.
  `HANDOFF.md` is the sole exception — it is always shown in full,
  because it's fully regenerated by design (§3).
- Documentation updates are part of the same subtask as the code
  change that motivated them — not a follow-up task, not a "batch
  later." The Definition of Done (§14) enforces this.
- If a Recovery Mode session (§10) can't complete documentation, that
  is not a policy violation — it is exactly what `PENDING_RECOVERY`
  (§11) exists to make safe.

## 8. Documentation Responsibilities

One paragraph of law per file. If you are ever unsure whether
something belongs in a file, this section is the tiebreaker.

**`PROJECT_RULES.md`** (this file) — the constitution. Workflow rules,
templates, and policy. Changes only via deliberate amendment (§21),
never as a side effect of implementation work.

**`HANDOFF.md`** — a self-contained session-boundary snapshot. Fully
regenerated (never diffed) whenever: the user types `HANDOFF`, before
switching Claude accounts, before ending a work session, or when
context budget is running low. Deliberately restates current
status, folder structure, and locked decisions in condensed form so a
cold session never has to open another file to resume. Never contains
permanent workflow rules — those live only in `PROJECT_RULES.md`.

**`PROJECT_CONTEXT.md`** — the single source of truth for "where are
we right now." Edited in place whenever the current milestone, task,
or subtask status changes. This is the first file a new session reads
after this one and `HANDOFF.md`. Must always distinguish what's
verified from what's merely stated-but-unconfirmed (§2). HANDOFF.md's 
'Where Things Stand' must say 'confirmed accurate as of this snapshot' 
+ only session delta, not full re-narration.

**`TASKS.md`** — the immutable-order checklist. Updated by checking
off a box the moment a task or subtask completes. Tasks are never 
reordered or skipped; if scope changes, add a new task rather than
rewriting history.

**`CHANGELOG.md`** — an append-only log, most-recent-first. Updated
after every completed implementation subtask, one entry per subtask.
Never edited retroactively except to fix a factual error in a past
entry.

**`API.md`** — the endpoint contract reference (request/response
shapes, status codes, auth requirements). Updated only when an
endpoint's actual contract changes — not when its implementation
changes internally with the same contract.

**`DATABASE.md`** — schema and relationship reference, split into
Implemented and Planned collections. Updated only when a schema,
index, or relationship changes. A model moves from "Planned" to
"Implemented" the moment its file exists and is verified.

**`ARCHITECTURE.md`** — folder structure, layering rules, request-flow
diagrams, and the "Deliberate Non-Choices" log. Updated only when the
actual architecture or request flow changes — routine file additions
that don't change the shape of the system don't require an update
beyond the folder tree.

**`AI_CONTEXT.md`** — the AI pipeline's design rationale, including
"Explicitly Rejected Designs." Updated only when an AI-related design
decision is made or changed. Until Task 11 lands, this file describes
intent, not implementation — say so explicitly if it's ever quoted as
current behavior.

**`DECISIONS.md`** — an ADR-style log of non-trivial engineering
decisions (one entry per decision: context, decision, rationale,
alternatives rejected). Updated whenever such a decision is made — this
is the *why* that `ARCHITECTURE.md` and `DATABASE.md` deliberately
don't restate.

**`INTERVIEW_NOTES.md`** — Q&A-style notes per completed feature,
written for future interview prep. Updated whenever a meaningful
feature is completed. This is the only file whose primary audience is
future-human-in-an-interview rather than future-Claude-in-a-session —
keep that framing when writing it. Updated at milestone boundaries, 
not per-subtask.

**`README.md`** — the user-facing front door. Updated only when setup
steps or user-facing functionality change. Never contains internal
workflow or status detail — that's what the rest of `docs/` is for.

## 9. Token-Aware Workflow

Continuously track remaining context budget against the work ahead,
not just the work in front of you right now.

- **Sufficient budget:** proceed with the normal loop in §4.
- **Budget getting low:** Do not start a subtask whose full loop (code+test+docs+commit msg) 
  cannot fit in remaining budget at current burn rate.
- **Budget clearly insufficient** for both finishing the current work
  *and* writing the documentation it requires: enter Recovery Mode
  (§10) rather than leaving either half-done and undocumented.

The guiding principle: a session should never end in a state that
forces the next session to spend tokens re-discovering what happened —
that re-discovery cost is exactly what this documentation system
exists to eliminate.

## 10. Recovery Mode

Recovery Mode exists to prevent expensive re-analysis by the next
Claude session when a session ends before implementation and
documentation are both cleanly finished.

When triggered:

1. Finish the current code change if it can be done safely in the
   budget remaining. Do not start a new one.
2. Do not begin any new implementation subtask.
3. Record exactly what remains unfinished, at the file level.
4. Record every documentation file that still needs updating, and
   which section of each.
5. Record whether implementation itself is complete.
6. Record whether manual testing is complete.
7. Record whether a git commit has been created.
8. Record whether that commit has been pushed.
9. Record anything the next Claude must resolve before writing any
   more code.
10. Write all of the above into `HANDOFF.md`'s `PENDING_RECOVERY`
    section (§11) — never leave the next session guessing.

Recovery Mode changes the Definition of Done (§14): documentation
updates are replaced by an honest, complete `PENDING_RECOVERY` block.

## 11. PENDING_RECOVERY Specification

Emitted only when Recovery Mode (§10) is triggered. Lives inside
`HANDOFF.md` as a dedicated section, exactly this shape:

```markdown
## PENDING_RECOVERY

Implementation: <Completed | Incomplete — state exactly what remains>
Manual Testing: <Completed | Incomplete | Not started>

Documentation Pending:
- <file> — <what specifically needs updating in it>
- <file> — <what specifically needs updating in it>

Git:
- Commit created: <Yes, <hash/description> | No>
- Pushed: <Yes | No | N/A>

Next Required Action:
<The exact, ordered sequence the next session must perform before
writing any new implementation code. Typically: finish the pending
doc updates above, create/verify the commit, push, only then continue
implementation.>
```

This block alone should eliminate the need for the next session to
re-inspect the repository to figure out what state things are in.

## 12. NEXT_SESSION_PROMPT Specification

Every `HANDOFF.md` ends with a `## NEXT_SESSION_PROMPT` section: a
ready-to-paste prompt for the *specific* next unfinished subtask,
written by the current session (which has maximum context) so the
next session can start implementing immediately instead of spending
tokens planning.

Required fields, in this order:

```markdown
## NEXT_SESSION_PROMPT

Current milestone: <n — name>
Current task: <n — name, status>
Current subtask: <n.n — name>

Objective: <one to three sentences, precise and testable>

Files expected to change:
- <path> — <what changes in it>

Documentation expected to change:
- <file> — <what changes in it, or "none">

Manual tests to perform:
- <specific, concrete test case>

Expected git commit: <suggested commit message>

Expected stopping point: <what "done" looks like for this subtask —
should map directly to the Definition of Done, §14>
```

This prompt lives inside the same self-contained HANDOFF.md, so it
can assume the reader already has the status narrative from earlier
in this same file — it doesn't need to re-derive milestone/task
context, just state the next concrete objective.

## 13. BOOTSTRAP_PROMPT Specification

Check HANDOFF.md's last section — if PENDING_RECOVERY, resolve that first; 
only use NEXT_SESSION_PROMPT if no PENDING_RECOVERY present

`NEXT_SESSION_PROMPT` (§12) assumes normal continuity — the same
general workflow, just picking up the next subtask. `BOOTSTRAP_PROMPT`
is different: it's the **cold-start** prompt, used when starting an
entirely new Claude session with no shared history (new chat, new
Claude account, or so much has changed that `HANDOFF.md`'s
`NEXT_SESSION_PROMPT` no longer applies cleanly).

Unlike `NEXT_SESSION_PROMPT`, this prompt is **static** — it does not
need to be regenerated each session, because its job is only to point
a cold session at the right files in the right order. It is defined
once, here, and reused verbatim (attach the project ZIP alongside it):

```markdown
The attached ZIP is the canonical current implementation of Faultline.
The docs/ folder inside it is the canonical project memory.

Before writing any code or proposing any plan:
1. Read docs/PROJECT_RULES.md in full. It defines how you are expected
   to behave on this project — workflow, documentation policy, git
   policy, terminal policy, all of it. Follow it exactly.
2. Read docs/HANDOFF.md — most recent session state, and the
   NEXT_SESSION_PROMPT (or PENDING_RECOVERY) at its end.
3. Read docs/PROJECT_CONTEXT.md — current milestone/task/subtask
   status, single source of truth.
4. Read docs/TASKS.md for the full roadmap and ordering.
5. Cross-check status lines in PROJECT_CONTEXT.md against the actual
   code before trusting any "DONE" marker — HANDOFF.md will flag any
   status line that wasn't independently reconfirmed.
6. Only after 1–5, consult ARCHITECTURE.md / DATABASE.md / API.md /
   AI_CONTEXT.md / DECISIONS.md as needed for the specific subtask
   ahead — do not read them all upfront.

Do not redesign the architecture. Do not recreate work already done.
Follow PROJECT_RULES.md's Development Workflow: one subtask at a time,
stop for confirmation after each.
```

If a project-wide policy in `PROJECT_RULES.md` itself changes, this
block is amended in place under the same amendment policy as the rest
of the document (§21) — it is not treated as session state.

## 14. Definition of Done

A subtask is complete only when, in normal mode:

- ✓ Code implemented, matching the locked architecture
- ✓ Manual testing completed (or explicit test instructions handed off,
  per §15)
- ✓ Required documentation updated — and *only* the required files
  (§7–§8)
- ✓ A suggested git commit provided (§16)
- ✓ The project is in a state the next subtask can safely start from

If Recovery Mode (§10) was entered instead, documentation updates and
the commit are replaced by a complete, honest `PENDING_RECOVERY`
block (§11). A Recovery Mode session is not a failed session — it's a
correctly-handled one, provided the handoff is complete.

## 15. Terminal Policy

- Claude does **not** execute shell commands against the user's local
  machine or local repository. All commands (install, test run, git
  operations) are provided in fenced code blocks for the user to run
  themselves.
- File contents are provided directly in the response — as complete
  file bodies or clearly-marked diffs — never as shell heredocs or
  redirection for the user to pipe blindly.
- This policy can be relaxed only by explicit, session-scoped
  instruction from the user (e.g., for token-budget reasons). Any such
  relaxation is recorded plainly in that session's `HANDOFF.md` and
  does not carry over to future sessions by default.

## 16. Git Workflow

- One subtask, one suggested commit, using a `<type>: <summary>`
  message that names the task/subtask number (e.g. `feat(9.1): add
  ErrorGroup model with compound unique index`).
- Claude suggests the commit message and, per §15, never runs the
  commit itself.
- Commits are not assumed to be pushed. `HANDOFF.md`'s git status
  field always distinguishes "committed" from "pushed," and never
  claims either without the user's confirmation in that session.
- Do not bundle unrelated changes into one commit for convenience —
  if a session touches both implementation and an unrelated doc fix,
  suggest two commits.

## 17. Teaching Expectations

- Briefly explain non-obvious engineering decisions while
  implementing — inline, concise, a sentence or two, not a lecture.
  Implementation is the priority; teaching is a lightweight overlay on
  it, not a separate deliverable.
- Substantive design rationale belongs in `DECISIONS.md`, not in a
  long inline explanation that then has nowhere else to live.
- Interview-framed rationale (the "why would you defend this choice"
  angle) belongs in `INTERVIEW_NOTES.md`, written after the feature is
  actually complete.

## 18. Code Quality Standards

- Modular architecture, strict separation of concerns per the
  layering convention (§6).
- Reusable, composable functions over one-off inline logic.
- Centralized error handling is the long-term standard, deliberately
  not yet retrofitted — plain try/catch is correct and expected
  everywhere until Task 20's `AppError`/`catchAsync` refactor lands.
  Don't "fix" this early; don't flag it as a bug.
- Security best practices are non-negotiable at every layer: hashed
  credentials, constant-time comparisons on secrets, ownership-scoped
  queries (not fetch-then-check), input validation at trust
  boundaries. See `DECISIONS.md` for the specific rationale behind
  each choice already made — don't re-derive from scratch, extend the
  pattern.
- Maintainability and scalability are weighed deliberately, not
  reflexively — see `ARCHITECTURE.md`'s "Deliberate Non-Choices."
  Premature abstraction is a defect, not a virtue, on this project.

## 19. Code Review Expectations

When a review is requested, review as a Google Staff Software
Engineer would: correctness, architecture, security, scalability,
readability, maintainability. Be technically honest — do not soften or
omit real weaknesses to be agreeable. A review that finds nothing
wrong on a non-trivial change should be treated as suspicious, not
reassuring.

## 20. Rule Priority

When rules conflict, resolve in this order:

1. **Explicit, in-session user instruction** — always wins for that
   session. It does not silently amend this document (§21).
2. **`PROJECT_RULES.md`** (this file) — the standing constitution.
3. **`HANDOFF.md`'s session-specific notes** (e.g. a noted, session-
   scoped Terminal Policy relaxation) — apply only for the session
   that recorded them.
4. **Individual Tier 2 file conventions** (e.g. `TASKS.md`'s
   no-reorder rule) — apply within that file's own domain.

## 21. Conflict Resolution & Amendment Policy

- **Docs vs. code:** the running code is ground truth for *what
  currently exists*. `DECISIONS.md` and `ARCHITECTURE.md` are ground
  truth for *what the design is supposed to be*. A mismatch between
  them is a bug to surface explicitly — in `HANDOFF.md` if discovered
  mid-session — never something to silently resolve by picking one
  side.
- **Doc vs. doc:** if two Tier 2 files appear to disagree, `DECISIONS.md`
  wins on *why*, and the most recently updated file wins on *current
  state* — but treat this as a documentation bug to fix, not just
  route around.
- **Amending this constitution:** `PROJECT_RULES.md` changes only when
  the user explicitly asks to change the workflow itself (as opposed
  to asking for implementation work). When that happens, the specific
  section is edited in place and the change is noted in that session's
  `HANDOFF.md`. Routine implementation sessions never modify this
  file.

  ## 22 — Audit Cadence

  Every 10 completed tasks, one session's sole job is re-verifying prior "DONE" claims against actual code/tests before continuing implementation.