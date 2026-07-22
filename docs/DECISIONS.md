# Faultline — Engineering Decisions

Format: decision, alternatives considered, justification. Added
whenever a non-trivial engineering choice is made, not for every line
of code. Entries may also carry two optional sub-sections: **Shipped**
(what/when — replaces a standalone changelog entry) and **Likely
interview questions** (replaces a standalone interview-notes entry).
Not every decision has both. Changes with no interesting decision
behind them (pure bugfixes, doc corrections, verification-only
subtasks) live in the chronological **Shipped Log** at the bottom
instead — that section is what `CHANGELOG.md` used to be.

> **Migration note (this pass):** `CHANGELOG.md` and
> `INTERVIEW_NOTES.md` were retired into this file as part of the
> Workstream 2 documentation re-engineering pass. See this pass's
> summary for the full migration completeness tally.

---

## Task 28: alert delivery infra + per-project config + new-group/severity-threshold triggers

**Decision:** Three sub-parts, built in order: (28.1) `Project.alertConfig`
embedded schema + `GET`/`PATCH /api/projects/:id/alerts`; (28.2)
`services/alertService.js` (Resend wrapper) + `services/alertQueue.js`
(BullMQ producer) + a second `Worker` instance added to the existing
`worker.js` process (not a third process); (28.3) trigger wiring in
`ingestController.js`/`projectController.simulateError` (new-group) and
`worker.js`'s `processEnrichmentJob` (severity-threshold).

**The one genuinely non-obvious call: how the severity-threshold
trigger reads `aiSummary.severity`.** `errorGroupService.enrichErrorGroup`
writes the freshly-computed `aiSummary` via its own
`ErrorGroup.findByIdAndUpdate(...)` call — it does not mutate the
`errorGroup` object passed into it, and does not return the computed
summary either. That function's own doc comment flags its contract as
already revised once, for Task 25, with an explicit "read this before
changing it again."

**Alternatives considered for getting severity out of it:**
1. Change `enrichErrorGroup` to return the computed `aiSummary` (or
   `null`), and have `worker.js` use the return value directly.
2. Re-fetch the `ErrorGroup` by ID in `worker.js`, immediately after
   `enrichErrorGroup` resolves, and read `aiSummary` off the fresh doc.
3. Have `enrichErrorGroup` accept an optional callback/side-effect
   parameter for "do X after writing aiSummary."

**Justification:** Went with (2). This codebase already has an
established, repeatedly-stated convention — see `enrichmentQueue.js`'s
and `worker.js`'s own comments — of re-fetching fresh from Mongo
rather than trusting an in-memory snapshot, specifically because a job
processor's in-memory state can go stale between steps. Re-fetching
`ErrorGroup` a second time (after enrichment, not just before it) is
the same pattern applied consistently, not a new one. (1) would have
been marginally cheaper (no second query) but means touching a
function whose own documentation explicitly warns against casual
changes to its contract — the cost of a second indexed `findById` on a
single-item, non-hot-path async worker job is negligible next to that.
(3) was rejected outright as unnecessary indirection for a two-line
follow-up read.

**Also worth noting — a real gap found and left as a documented gap,
not silently patched:** the severity-threshold trigger can only ever
fire from the AI enrichment worker path, never from `simulateError`'s
early return before enrichment is enqueued, and never synchronously at
ingestion — severity does not exist until enrichment completes, which
is itself async and can take several seconds. This means, unlike the
new-group trigger (which fires the instant a group is created), a
user watching for a severity alert immediately after triggering an
error should expect a delay on the order of the enrichment job's own
latency, not instant delivery. This is inherent to the feature as
specified (severity is AI-derived), not a bug in this task's wiring.

**Verification status — all three sub-parts fully confirmed live.**
28.1 and 28.2 were confirmed early (real HTTP round trip; real
Redis/BullMQ/Resend, a real email delivered to a real inbox). 28.3 —
the trigger wiring — took considerably longer to conclusively verify
than expected, not because the trigger logic itself was wrong, but
because of three real, stacked environmental issues found during
manual testing. Recording the full sequence here since it's genuinely
useful for whoever hits similar symptoms testing this kind of
queue/worker system again:

1. **Stale worker process, never restarted after a code change.** The
   worker process running during the first test attempt had been
   started before `worker.js` was updated with 28.3's severity-
   threshold logic. It kept running the old, in-memory version even
   after the file on disk changed — Node doesn't hot-reload a running
   process. Enrichment completed normally under that stale process
   (writing a perfectly good `aiSummary`, severity `"high"`), but the
   severity-threshold check simply didn't exist yet in that process's
   memory, so nothing was ever going to fire, with no error to signal
   why. Symptom looked exactly like a logic bug in the new code;
   actually just old code still running. Fixed by killing and
   restarting the worker process.
2. **Fingerprint-deduplication collisions in manual test payloads.**
   `services/fingerprintService.js`'s `generateFingerprint` hashes the
   extracted error *type* plus the normalized *stack signature* (see
   that file) — not the raw `message` string. Manual test `curl` calls
   varied only `message` (e.g. appending a timestamp) while reusing an
   identical `stack` string across calls, so every "new" test event
   produced the same fingerprint and deduped into the same, already-
   existing `ErrorGroup` (`isNewGroup: false` every time). This meant
   several rounds of testing never even reached a **new** group, so
   neither trigger had a fresh event to fire on. Fixed by varying the
   stack trace's line number (not just the message) on each test call,
   guaranteeing a distinct fingerprint.
3. **Two `worker.js` processes running simultaneously.** `ps aux`
   revealed a leftover process from an earlier `npm run worker:dev`
   session that had never been killed, running alongside a fresh
   `npm run worker`. Both were connected to the same Redis instance
   and the same `enrichment`/`alerts` queues; BullMQ hands each job to
   whichever worker claims it first, with no guarantee it's the one
   whose terminal is currently being watched. This produced the most
   confusing symptom of the three: the queue's own job-count stats
   (`getJobCounts()`) showed jobs genuinely completing, while the
   terminal being watched showed nothing — because the *other*,
   invisible process was the one doing the work. Diagnosed by directly
   querying `enrichment.getJobCounts()` (showed `completed: 5` when
   the visible terminal showed zero enrichment completions) and then
   `ps aux | grep "node worker.js"` (showed two PIDs). Fixed by killing
   the stale one.

None of these three were bugs in the 28.3 implementation — the actual
trigger logic worked correctly the entire time; every failed test
attempt had a specific, identifiable environmental cause once actually
investigated (rather than assumed to be a code bug). Final confirming
test used temporary `console.log` debug statements added to
`processEnrichmentJob` (removed once the test passed) plus a
temporarily-lowered `minSeverity: "low"` (to remove severity-value
randomness from the test), which showed the exact evaluated
comparison (`severity=high minSeverity=low comparison=true`) followed
by the alert job completing and a real email arriving — a fully
conclusive, mechanism-level confirmation, not just an inferred one.

---



**Decision:** `User.js` hashes `passwordHash` in a `pre('save')` hook
(cost factor 12), and exposes `comparePassword()` as an instance
method. The auth service (Task 3) calls `User.create({ ...,
passwordHash: plaintextPassword })` and lets the model handle hashing
— it never hashes passwords itself.

**Alternatives considered:**
1. Hash in the service layer (`authService.register()` calls
   `bcrypt.hash()` before calling `User.create()`).
2. Hash in the controller.

**Justification:** Hashing is a data-integrity invariant of the
`User` model, not a piece of business logic — no code path should ever
be able to persist a `User` document with a plaintext password, even
a future script, seed, or admin tool that bypasses the service layer.
Putting it in the model's `pre('save')` hook makes that invariant
structural rather than convention-based (every write path gets it for
free), whereas hashing in the service only protects writes that
happen to go through that specific service function. This does mean
`User.create()` and `user.save()` expect `passwordHash` to be set to
the *plaintext* password on input, which is slightly unusual naming —
worth being explicit about in code comments (done) so a future reader
isn't confused about why a field literally named `passwordHash`
sometimes holds plaintext momentarily before `save()`.

**Cost factor:** 12 rounds (bcrypt default recommendation as of 2026
hardware). Higher costs (14+) meaningfully slow down login latency for
marginal additional brute-force resistance at this threat model
(a portfolio/demo project, not a bank). 12 is the commonly cited
floor for production-grade hashing and costs ~250-300ms per hash on
typical hardware — acceptable for register/login, which aren't
hot-path operations.

**Shipped:**
- Task 2.3 — pre-save hook + `comparePassword()` added to `User.js`.
- Task 3.2 — `authService.register()` built on top of it.

**Likely interview questions:**
- *Where do you hash the password, and why there specifically?* — In
  a Mongoose `pre('save')` hook on the `User` model, not the auth
  service, for the structural-invariant reason above.
- *Why bcrypt cost factor 12 specifically?* — The commonly-cited floor
  for production-grade hashing on current hardware (~250-300ms/hash).
  Higher buys marginal extra resistance at a latency cost not
  justified for this threat model.
- *What does the JWT payload contain, and why?* — Just `{ sub: userId
  }` plus the standard `iat`/`exp` claims from `jsonwebtoken`. `sub`
  is the conventional claim name for "who this token is about", kept
  deliberately minimal — no email, no role, nothing that goes stale if
  user data changes without the token being reissued.

---

## Auth failure responses: identical error/status for distinct failure causes

**Decision:** `authService.login()` returns the same `401 "Invalid
email or password"` whether the email doesn't exist or the password
is wrong. `authMiddleware` similarly collapses "malformed token" and
"expired token" into the same `401 "Not authorized, invalid or
expired token"` (though it does distinguish the separate "user no
longer exists" case, since that's not attacker-exploitable info about
someone else's account).

**Alternatives considered:**
1. Distinct messages per cause (`"Email not found"` vs. `"Incorrect
   password"`; `"Token expired"` vs. `"Token invalid"`).

**Justification:** Distinct messages for login let an attacker
enumerate which emails are registered by observing which error they
get back — a well-known anti-pattern. Collapsing malformed vs. expired
token similarly avoids leaking token-lifecycle information to a client
presenting a token it doesn't control the validity of. This trades a
small amount of debugging convenience (a legitimate user can't tell
"my token expired" from "I sent garbage") for a real security property;
acceptable since the frontend's response to either case is identical
anyway — redirect to login.

**Shipped:** Task 3.3 — login endpoint built with this behavior from
the start.

**Likely interview questions:**
- *How do you prevent account enumeration on login?* — Both failure
  cases return the identical `401 "Invalid email or password"`;
  distinct messages would let an attacker tell which emails are
  registered by watching which error comes back.

---

## authMiddleware: re-fetch the user on every request, uniform 401s

**Decision:** `authMiddleware` verifies the JWT signature/expiry via
`jsonwebtoken`, then does a DB lookup for the user referenced by the
token's `sub` claim (stripping `passwordHash`) rather than trusting
the token's claims alone. All failure modes (missing header,
malformed/invalid signature, expired token) collapse into one `401`;
"token valid but user no longer exists" gets its own distinct `401`
message, since that's not attacker-exploitable information about
someone else's account.

**Alternatives considered:**
1. Trust the JWT's claims without a DB re-check (faster, no extra
   query per request).

**Justification:** A JWT is a self-contained, cryptographically
signed claim that stays valid until expiry regardless of what happens
to the underlying account. If a user is deleted after a token was
issued, the token is still technically "valid" for the rest of its
lifetime unless something checks current DB state. Re-fetching on
every protected request closes that gap at the cost of one extra DB
read per request — an acceptable tradeoff at this scale, and the same
enumeration-avoidance logic as login justifies collapsing
malformed/expired into one response.

**Shipped:**
- Task 4.1 — `authMiddleware` added.
- Task 4.2 — `GET /api/auth/me` added as the first protected route,
  all four cases (valid/missing/invalid/expired) manually verified.

**Likely interview questions:**
- *Walk me through what happens when a request hits a protected
  route.* — `authMiddleware` reads the `Authorization: Bearer <token>`
  header, verifies the JWT, then does a DB lookup for the user
  referenced by `sub` (stripping `passwordHash`). If found, it's
  attached as `req.user` and `next()` runs; the route handler itself
  never touches JWTs or Mongoose auth logic.
- *Why re-check that the user still exists, instead of just trusting
  the token?* — See Justification above.
- *Do you distinguish "expired token" from "malformed/invalid token"
  in the response?* — No, deliberately; `jwt.verify` throws for both
  and there's no reason to give more granular failure information to
  a client (or attacker) holding a token they don't control the
  validity of.
- *How would you test this without a frontend?* — Four `curl` cases
  against the same route: a valid token from a real login (200), no
  header (401), a garbage token string (401), and a token signed with
  a real secret but an already-past expiry (401) — confirms the
  expiry check itself works, not just "malformed tokens get rejected."

---

## Project schema tracks `updatedAt`, unlike `User`

**Decision:** `Project` uses `timestamps: { createdAt: true, updatedAt:
true }`, while `User` only tracks `createdAt`. `DATABASE.md`'s original
sketch of the `Project` schema (written during the architecture review,
before Task 5 was broken into subtasks) only listed `createdAt` — this
is a deliberate, documented deviation, not drift.

**Alternatives considered:**
1. Match `User` exactly (`createdAt` only), add `updatedAt` later if
   needed.

**Justification:** Task 5's scope explicitly includes CRUD, meaning
`Project` supports `PATCH` (subtask 5.4) — `name` and `githubRepo` can
change after creation. `User` has no update path yet, so `updatedAt`
would be dead weight there. For `Project`, "when was this last
changed" is immediately useful once updates exist, and the cost is one
extra Date field, free via Mongoose's `timestamps` option.

**Shipped:** Task 5.1 — `Project` model added with this schema,
verified against the Atlas dev cluster (valid project with/without
`githubRepo`, malformed `githubRepo` rejected, missing `name`
rejected, read-back/delete round-trip confirmed).

---

## API key hashing: SHA-256, not bcrypt

**Decision:** `apiKey.js` hashes raw API keys with SHA-256
(`hashApiKey`), not bcrypt — a deliberate departure from the
password-hashing pattern in `User.js`. Key generation and hashing
happen in `projectService.createProject()` (a service function), not
a Mongoose hook, since minting a credential is a business action, not
a model-level invariant the way password hashing is.

**Alternatives considered:**
1. Reuse bcrypt for consistency with password hashing.
2. HMAC-SHA256 with a server-side secret pepper, for extra defense if
   the DB is compromised without the app server.

**Justification:** Bcrypt's deliberate slowness (cost 12 costs
~250-300ms/hash) exists to resist offline brute-forcing of *low-
entropy, human-chosen* secrets. An API key here is 256 bits of
`crypto.randomBytes` — brute-forcing it via hash speed is already
infeasible regardless of hash function, so bcrypt's slowness buys
nothing and costs real latency on a path that matters:
`apiKeyMiddleware` hashes the incoming key on *every* ingestion
request, not once at login. SHA-256 is fast, deterministic, and
sufficient given the input entropy.

HMAC-with-pepper (option 2) is a genuinely stronger design — a stolen
DB alone (without the app's secret) doesn't let an attacker directly
compare hashes — but it's an added-complexity/marginal-benefit
tradeoff not clearly justified at this project's threat model.
Documented here as the "what I'd add for a real production system"
answer, not built now.

**Update (Task 6, original):** `apiKeyMiddleware.js` looked up the
project by hash via `Project.findOne({ apiKeyHash })`, then
double-checked the match with `crypto.timingSafeEqual` before
attaching `req.project`.

**Update (this pass — see "apiKeyMiddleware: removal of inert
timingSafeEqual check" below):** the `timingSafeEqual` check described
above has since been removed. It ran *after* an exact-match DB lookup
had already succeeded, so it could never actually be false — it
protected against nothing. The hash-indexed `Project.findOne` lookup
is, and always was, the real security boundary. Read that entry for
the full reasoning before relying on the "Likely interview questions"
answer below, which describes the original (now superseded) design.

**Shipped:**
- Task 5.2 — `generateApiKey()`/`hashApiKey()` added to `utils/apiKey.js`.
- Task 5.3 — wired into `projectService.createProject()`/`listProjects()`.
- Task 6.1 — `apiKeyMiddleware` added, all 5 manual cases passed (valid
  key, missing header, malformed key, wrong key, deleted-project key).

**Likely interview questions:**
- *Where does API key hashing happen, and why not in the model like
  password hashing?* — In `projectService.createProject()`, not a
  Mongoose hook. The raw key only needs to exist long enough to
  return it once; that's a business action (mint a credential), not a
  model-level invariant the way "never persist a plaintext password"
  is.
- *How do you make sure the raw API key is never accidentally
  persisted or logged?* — `Project.apiKeyHash` only ever receives
  `hashApiKey()`'s output; the raw key never touches a Mongoose
  document, and morgan logs method/path/status, not bodies.
- *Why is project creation behind JWT auth and not API-key auth?* —
  They authenticate different things: JWT authenticates a logged-in
  human acting on their own account (creating a project is exactly
  that); API-key auth authenticates a program sending error events,
  and there's a chicken-and-egg problem anyway — you can't API-key-
  auth your way into creating the thing that gives you an API key.
- *Why is this a separate middleware from `authMiddleware` instead of
  one unified auth layer?* — They authenticate fundamentally
  different callers (human dashboard session vs. program credential);
  forcing either through the other's semantics (expiry/refresh vs.
  no-session) would be a worse fit for both, and keeping them separate
  keeps each failure mode legible.
- *(Historical, describes the design before this pass's removal — see
  the update note above) Why hash-lookup plus `timingSafeEqual`
  instead of just one or the other?* — At the time, the reasoning was
  that `timingSafeEqual` was defense in depth against a timing
  side-channel on the comparison step. This pass found that reasoning
  didn't hold: the comparison ran against a value already confirmed
  equal by the DB lookup, so it could never be false.
- *What does `apiKeyMiddleware` do if the key is well-formed but
  doesn't match any project?* — Same uniform 401 as every other
  failure case, for the same enumeration-avoidance reasoning as the
  project 404s and login.

---

## Project not-found vs. not-yours: identical 404, not 403

**Decision:** `GET/PATCH/DELETE /api/projects/:id` return an identical
`404 "Project not found"` whether the project genuinely doesn't exist,
belongs to a different user, or `:id` isn't even a syntactically valid
ObjectId. There is no `403 Forbidden` case anywhere in this path.

**Alternatives considered:**
1. `404` for nonexistent, `403` for exists-but-not-yours — the more
   "RESTfully correct" distinction.

**Justification:** Same account-enumeration logic already applied to
login and auth middleware. A `403` on someone else's project confirms
that project ID exists and belongs to *someone* — an attacker
iterating over ObjectIds could map out which project IDs are real even
without ever seeing their contents. Collapsing to a uniform `404`
costs nothing for a legitimate user and closes that enumeration
surface. Malformed ObjectIds (Mongoose `CastError`) get folded into
the same `404` for the same reason.

**Implementation note:** this only works because every service
function scopes its Mongo query by `{ _id: projectId, ownerId }`
together, not `_id` alone followed by an ownership check in the
controller — scoping the query itself means Mongo never returns
another user's document to the service layer at all.

**Shipped:** Task 5.4 — `getProject`/`updateProject`/`deleteProject`
added with this scoping; a duplicate `module.exports` bug found and
fixed during manual testing (see interview Q&A below).

**Likely interview questions:**
- *How do you make sure a user can't read or modify someone else's
  project by guessing an ID?* — Every query scopes by `{ _id:
  projectId, ownerId }` together, in the query itself — never a plain
  `findById` followed by an after-the-fact ownership check, which
  would briefly let the document exist in memory before rejection.
- *Why 404 instead of 403 when a project exists but isn't yours?* —
  Enumeration avoidance, same principle as login.
- *Walk me through a bug you actually hit while building this.* — A
  duplicate `module.exports` at the bottom of `projectService.js`
  silently overwrote the real one — no syntax error, the file loaded
  fine, but `getProject`/`updateProject`/`deleteProject` were missing
  from what the module actually exported, so calling them threw "not a
  function" at request time, not require time. Caught by testing every
  endpoint immediately rather than assuming the code matched what was
  written — exactly why manual verification is a gate on every
  subtask, not a formality.

---

## Ingestion endpoint is a skeleton, not full ingestion — Task 7

**Decision:** `POST /api/events` initially (Task 7) validated
(`message`, `stack` required strings) and returned `202 Accepted`
without writing anything to the database. (Superseded by Task 9.3's
real persistence — kept here as the historical record of why `202`
was chosen and why fields were accepted-but-unused early on.)

**Justification:** `ErrorGroup`/`ErrorEvent` didn't exist as models
until Task 9, and fingerprinting didn't exist until Task 8. Building
persistence early would have meant guessing at a schema Task 9 was
explicitly responsible for designing. `202` rather than `201` was
deliberate: `201 Created` asserts a resource was created, which would
have been false at that stage.

**Not yet validated (at the time):** `env` and `metadata` were
accepted in the request body but not validated or used, since their
real shape depended on what `ErrorEvent` (Task 9) would need.

**Shipped:** Task 7.1 — skeleton added; all 4 status-code cases
verified (valid → 202, missing message → 400, missing stack → 400,
missing/invalid key → 401 via `apiKeyMiddleware`).

**Likely interview questions:**
- *Why does `POST /api/events` return 202 instead of 201 on success?*
  — `201 Created` asserts a resource now exists; at the skeleton stage
  nothing did. `202 Accepted` says "received, will be acted on," which
  was the true state, and remains true today since AI enrichment (the
  other half of "processing") is still fire-and-forget and can lag the
  response.
- *Why accept `env`/`metadata` in the body if they weren't used yet?*
  — So client integrations could send the full intended payload shape
  early and not need a breaking change later. Accepting-but-ignoring
  is forward-compatible; rejecting-then-later-accepting is not.
- *How would you extend this into real ingestion?* — Task 8 added
  fingerprinting; Task 9 added the models and swapped the skeleton for
  an atomic `findOneAndUpdate` upsert keyed on `{ projectId,
  fingerprint }`. The validation/auth layers built in Task 7 didn't
  need to change for that.

---

## Stack fingerprinting: normalized top-frame signature (app frames only), not a hash of the raw stack

**Decision:** `stackNormalizer.js`'s `normalizeStack()` reduces a raw
stack trace to a signature built from up to 5 application-code frames
(dependency/runtime frames — `node_modules`, `node:`, `internal/` —
filtered out unless zero app frames remain), with each frame's file
path anchored to the *last* recognized project-root segment
(`server`/`client`/`src`/`app`/`lib`) rather than the full absolute
path. `fingerprintService` hashes this signature, not the raw stack.

**Alternatives considered:**
1. Hash the entire raw stack string as-is.
2. Hash only the error message + top single frame.
3. Anchor file paths on the *first* matching root-marker segment
   instead of the last.

**Justification:** Hashing the raw stack (option 1) makes every
occurrence of the "same" error a distinct fingerprint whenever the
absolute path differs — which it always will between local, Docker,
and CI. Filtering to app-code frames means the same underlying bug
still groups together even across different dependency versions.
Capping at 5 frames balances "too few merges distinct bugs" against
"too many fragments the same bug across trivial call-path
differences." Falling back to all frames when zero app frames remain
handles errors that originate entirely inside a dependency.

**Bug found during manual verification (option 3, corrected):** the
first implementation anchored on the *first* matching root-marker
segment. This silently broke cross-environment fingerprint stability
whenever the deploy root itself was also a marker word — e.g.
Docker's conventional `/app/server/services/foo.js` matched `app`
before reaching the real project root `server`, while the same file
locally matched `server` directly — two different signatures for the
identical bug. Switched to anchoring on the *last* matching marker.

**Shipped:** Task 8.1 — `parseStackFrames`/`normalizeStack`/
`normalizeFilePath` added, manually verified (cross-environment
stability, node_modules filtering, frame cap, anonymous frames,
garbage input).

**Likely interview questions:**
- *Why not just hash the raw stack trace text for the fingerprint?* —
  Machine-specific absolute paths shift across environments for
  reasons unrelated to the bug; hashing raw text would treat the same
  logical error as a brand-new group every time.
- *Why exclude node_modules/internal frames instead of just capping
  frame count?* — An unfiltered-but-capped stack is often dominated by
  dependency internals that have nothing to do with which application
  bug occurred and churn independently across dependency bumps.
- *What happens to an error that occurs entirely inside a dependency,
  with no app frames at all?* — Falls back to all frames unfiltered
  rather than an empty signature — losing fidelity there would
  silently break dedup for a real class of errors.
- *How would this handle minified production JavaScript?* — It would
  still parse and fingerprint, but frame quality degrades (minified
  identifiers, bundle paths). Fixing that needs source-map-aware
  resolution, explicitly out of scope per the architecture blueprint.

---

## Fingerprint = hash(error type + normalized stack signature), not signature alone

**Decision:** `fingerprintService.generateFingerprint()` combines an
error type extracted from the message (`extractErrorType()`, matching
the conventional `SomeError:` prefix, falling back to a generic
`"Error"` bucket) with `stackNormalizer`'s signature, then hashes the
combined string with SHA-256. If the signature is empty, falls back to
hashing type + raw message instead of type alone.

**Alternatives considered:**
1. Hash the normalized signature alone (no type).
2. Hash the full raw error message + signature.
3. On empty signature, still hash type-only rather than falling back
   to the message.

**Justification:** Signature-alone (1) can merge two genuinely
different bugs sharing a call site after a refactor (e.g. a
`TypeError` and a `RangeError`). Hashing the full raw message (2)
reintroduces the exact problem `stackNormalizer` avoids — messages
usually carry dynamic values that would fragment the "same" bug into
many fingerprints. Type-only on empty signature (3) would collapse
every stackless error in a project into one fingerprint; falling back
to type + raw message instead preserves fidelity for that edge case.

**Known limitation:** `extractErrorType()` only recognizes the
conventional `SomeError: ...` shape. Custom error classes or
plain-string throws fall into the generic `"Error"` bucket — a known,
accepted tradeoff, not scheduled for a fix.

**Shipped:** Task 8.2 — `fingerprintService` added, manually verified
(cross-environment equality, type-mismatch produces different
fingerprint, `extractErrorType` edge cases, stackless fallback
determinism).

**Likely interview questions:**
- *Why not just use stackNormalizer's signature as the fingerprint
  directly?* — It doesn't capture error type; two different bugs can
  share a call site after a refactor and would otherwise collapse into
  one group.
- *Why parse the error type out instead of hashing the full message?*
  — Same reasoning as path anchoring — the full message usually
  carries dynamic, request-specific values that would fragment the
  same bug into a new fingerprint on every occurrence.
- *What happens if the error message doesn't follow the "TypeError:
  ..." convention?* — Falls back to a generic `"Error"` bucket — a
  known, deliberate simplification.
- *Is SHA-256 sufficient here, or should this use bcrypt like
  passwords?* — SHA-256; this isn't a low-entropy secret being
  protected from brute force, it's a deterministic bucketing key
  computed on every ingested event. bcrypt's slowness would just add
  latency to a hot path for no benefit.

---

## ErrorGroup uses firstSeen/lastSeen instead of Mongoose timestamps

**Decision:** `ErrorGroup` does not use `{ timestamps: true }`.
`firstSeen`/`lastSeen` fields cover that role instead, both defaulting
to `Date.now` on creation.

**Justification:** Mongoose's `updatedAt` bumps on *any* document
save. `lastSeen` has narrower, dedup-specific semantics — it should
only bump when a duplicate event arrives for an existing group, not on
unrelated edits like a status PATCH. Keeping both fields would let
them drift apart and raise the question of which is authoritative;
`firstSeen`/`lastSeen` alone is the simpler, correct model.

**Shipped:** Task 9.1 — `ErrorGroup` model added with compound unique
index on `{ projectId, fingerprint }`, manually verified via
`validateSync()` (valid doc clean, required-field rejection, bad-enum
rejection, all defaults correct).

**Likely interview questions:**
- *Why is `aiSummary` a nested schema instead of separate fields?* —
  It's optional as a whole (`null` until enrichment runs), and grouping
  it makes "not yet enriched" a single clean `null` check instead of
  five individually-nullable fields.
- *Why `{ _id: false }` on the sub-schemas?* — `aiSummary` and each
  `statusHistory` entry are embedded documents, never queried or
  referenced independently — their own `_id` would be unused overhead.
- *What actually prevents two ErrorGroups for the same bug?* — The
  unique compound index on `{ projectId, fingerprint }` declared here;
  the atomic-upsert dedup mechanism (see that entry below) is what
  relies on it to make concurrent-duplicate handling safe.

---

## Atomic upsert dedup: `findOneAndUpdate` before read-then-write

**Decision:** `errorGroupService.recordEvent()`'s `ErrorGroup` write is
a single atomic `findOneAndUpdate(..., { upsert: true })` keyed on
`{ projectId, fingerprint }` — never a `findOne` followed by a
conditional `create`/`update`. First-occurrence is detected from the
result's `lastErrorObject.upserted` (`includeResultMetadata: true`),
not a separate existence check. `ErrorEvent` creation is a separate,
non-atomic `create()` call after the upsert resolves.

**Alternatives considered:**
1. `findOne` first; if nothing found, `create()`; else update.
2. Force both the `ErrorGroup` upsert and `ErrorEvent` creation into
   one atomic operation.

**Justification:** Read-then-write (1) has a race: two concurrent
requests for a brand-new fingerprint could both see "no existing
group" and both try to create one — only the unique index would catch
it, as a thrown duplicate-key error, not a clean result. The atomic
upsert makes MongoDB itself resolve the race; whichever request
arrives "second" at the DB level just updates the document the first
one created. Only the `ErrorGroup` write needs this atomicity — it's
the one with a uniqueness constraint two concurrent requests could
race on. `ErrorEvent` has no such constraint, so forcing both into one
operation (2) would add complexity for no correctness benefit.

**Known edge case, closed this pass:** even an atomic upsert can, in
rare cases, race with the unique index itself settling under extreme
concurrency on a brand-new fingerprint, surfacing as a `E11000`
duplicate-key error on the upsert. See "errorGroupService: retry-once
on duplicate-key error" below for the fix.

**Shipped:** Task 9.3 — `errorGroupService.recordEvent()` wired into
`ingestController`; manually verified live against Atlas (duplicate
event collapses into one `ErrorGroup` with `count: 2`, two linked
`ErrorEvent` docs; distinct event produces a separate `ErrorGroup`
with `count: 1`).

**Likely interview questions:**
- *Why findOneAndUpdate with upsert instead of findOne then
  create-or-update?* — See Justification above; the read-then-write
  race is real and the atomic upsert closes it for free.
- *How do you know if an event created a new group or matched an
  existing one?* — `lastErrorObject.upserted` off the upsert result,
  checked directly — no separate "does this exist" query first.
- *Why does ErrorEvent creation happen as a separate write instead of
  inside the same atomic operation?* — Only the `ErrorGroup` write has
  a uniqueness constraint to race on; a plain `create()` after it is
  correct and simpler.

---

## ErrorGroup upsert: message/stackSample fixed on insert, count/lastSeen updated every time

**Decision:** In `errorGroupService.recordEvent()`'s atomic
`findOneAndUpdate`, `message` and `stackSample` are written only via
`$setOnInsert` — set once, on first occurrence, never touched again.
`lastSeen` (`$set`) and `count` (`$inc`) update on every call,
including duplicates.

**Alternatives considered:**
1. Overwrite `message`/`stackSample` on every occurrence with the
   latest event's values.
2. Store a rolling list of samples instead of one.

**Justification:** `stackSample` exists to give a human a single
representative look at the bug, not a live mirror of the most recent
occurrence — overwriting it on every duplicate would make it
non-deterministic for no benefit, since the individual, unaltered
stack for every occurrence is already preserved per-event in
`ErrorEvent.rawStack`.

**Shipped:** Landed as part of Task 9.3 (see above).

---

## ErrorEvent model: rawStack per-occurrence, no unique index, Mixed metadata

**Decision:** `ErrorEvent` stores the literal `rawStack` for a single
occurrence (distinct from `ErrorGroup.stackSample`, one representative
sample for the whole group), carries no unique index (many events
legitimately point at one group), stores `metadata` as unvalidated
`Mixed`, and does not use `{ timestamps: true }` (`receivedAt` already
covers that role, same reasoning as `ErrorGroup`'s `firstSeen`/
`lastSeen`).

**Justification:** Each of these mirrors an existing pattern
elsewhere in the schema rather than introducing a new one — see
`ErrorGroup uses firstSeen/lastSeen instead of Mongoose timestamps`
above for the timestamps reasoning. Locking down a shape for
caller-supplied `metadata` now would be exactly the kind of premature
abstraction this project's philosophy calls out as a defect — there's
no concrete need for it yet.

**Shipped:** Task 9.2 — `ErrorEvent` model added, manually verified via
`validateSync()` (valid doc clean, both required-field rejections, all
defaults correct). This pass additionally reconciled the model against
`DATABASE.md`'s already-documented intent by adding `env`'s
`maxlength: 50` and the `{ errorGroupId: 1, receivedAt: -1 }` compound
index, both of which were documented but not actually implemented in
code — see "ErrorEvent: reconcile schema with documented intent"
below.

**Likely interview questions:**
- *Why store rawStack here when ErrorGroup already has stackSample?*
  — They answer different questions: `stackSample` is one
  representative sample for the whole group (set once); `rawStack` is
  the literal stack for *this* occurrence.
- *Why no unique index on ErrorEvent, when ErrorGroup has one?* — The
  uniqueness constraint belongs to the *bug*, not the *occurrence* —
  many `ErrorEvent`s are expected to point at the same `ErrorGroup`.
- *Why is metadata Mixed instead of a defined sub-schema?* — It's
  caller-supplied, arbitrary context with no shape Faultline needs to
  validate or query on right now. Locking in a schema would be
  premature abstraction.
- *Why no `{ timestamps: true }`?* — Same reasoning as `ErrorGroup`'s
  `firstSeen`/`lastSeen` — `receivedAt` already is the timestamp that
  matters for a per-occurrence record.

---

## aiService: package and model choice (Task 11)

**Decision:** Use `@google/genai` (not `@google/generative-ai`) as the
Gemini SDK, and hardcode `gemini-2.5-flash` as the model in
`aiService.js`. `aiService` itself is split into three pure-ish
functions — `buildPrompt`, `callGemini`, `parseAndValidate` — rather
than a 4-layer provider class hierarchy.

**Alternatives considered:**
1. `@google/generative-ai` — the older SDK many existing tutorials
   reference.
2. A newer/heavier model (e.g. a Pro-tier model).
3. A `AIService → GeminiProvider → PromptBuilder → ResponseParser`
   class hierarchy.

**Justification:** `@google/generative-ai` is Google's deprecated
predecessor; `@google/genai` is the current GA, actively maintained
SDK — verified via web search rather than trained knowledge, since
Google's SDK naming has changed more than once. Enrichment here is a
bounded summarization task, not frontier reasoning, so
`gemini-2.5-flash` is stable, cheap, and sufficient. A full four-layer
class hierarchy (3) is over-abstraction for a single provider, single
call site — the pure-function split buys the real benefit (unit-
testable `buildPrompt`/`parseAndValidate` with no network call, no SDK
mock needed) without the unjustified indirection.

**Known doc gap (resolved this pass):** `AI_CONTEXT.md`'s prose used
to describe `confidence` as `"high"`/`"low"` strings, while
`ErrorGroup.js`'s `aiSummarySchema` has always defined it as `Number,
min: 0, max: 1`. This was flagged across three files (`AI_CONTEXT.md`,
`HANDOFF.md`, this entry) across multiple sessions and never actually
corrected — see "P3 — Remaining documentation-quality fixes" in this
pass's summary. `AI_CONTEXT.md` now correctly describes it as a
`Number` in `[0, 1]`, and the stale "known doc gap" callouts have been
removed. `confidence` still isn't computed anywhere yet — that's Task
14, not part of this pass or of Task 11.

**Shipped:** Task 11 — `aiService.js` added (`buildPrompt`/
`callGemini`/`parseAndValidate`), `@google/genai@^2.10.0` added to
`server/package.json`. Manually verified: pure functions locally
(valid input, bad severity, malformed JSON, empty `suggestedFix`);
`callGemini` live against a real Gemini API key.

**Likely interview questions:**
- *Why does callGemini return raw text instead of parsed JSON?* —
  Keeps the "thin wrapper" honest — `callGemini` only talks to the
  SDK. `parseAndValidate` owns parsing and shape-checking, so it can
  be unit tested with hand-written strings, no network involved.
- *Why does parseAndValidate return null instead of throwing on
  invalid input?* — Per `AI_CONTEXT.md`'s resilience contract — an
  invalid AI response should result in `aiSummary: null` and
  ingestion continuing, not a crash.
- *Why @google/genai instead of @google/generative-ai?* — The latter
  is Google's deprecated predecessor SDK, confirmed via web search
  rather than assumed.

---

## githubService: snippet windowing + optional GITHUB_TOKEN (Task 12)

**Decision:** `fetchCodeSnippet()` returns a windowed slice of the
file (±15 lines around the target line, each line number-prefixed),
not the full file content. An optional `GITHUB_TOKEN` env var was
added — unauthenticated requests work fine for public repos (60
req/hour); the token only matters for private repos or a higher rate
limit.

**Alternatives considered:**
1. Send the entire file content in the prompt.
2. Require `GITHUB_TOKEN` as mandatory config.

**Justification:** Neither was specified in `AI_CONTEXT.md`, but both
were unavoidable implementation decisions. Windowing keeps prompt
size/cost bounded regardless of file size and matches the Data
Minimization principle already stated in `AI_CONTEXT.md`. Making the
token optional keeps the MVP usable against public repos with zero
extra setup, while still supporting private repos for anyone who adds
one.

**Known limitation, not solved here:** the file path used to query
GitHub comes from `stackNormalizer`'s `normalizeFilePath()`, a
heuristic, not a guarantee it matches the GitHub repo's actual folder
layout. A wrong guess just 404s and falls back to stack-trace-only
grounding — never a hard failure.

**Shipped:** Task 12 — `githubService.js` added (`fetchCodeSnippet`/
`extractSnippet`). Manually verified: `extractSnippet` locally
(centered window, clamped at file start/end, empty input, invalid line
number); `fetchCodeSnippet` live against a real public repo (valid
file, missing file → `null`, no-repo-configured → `null`, malformed
`githubRepo` → `null`).

**Likely interview questions:**
- *Why re-validate the githubRepo regex here when Project.js already
  enforces it?* — Defense in depth for the one place this value
  becomes part of an outbound URL — never trust that something
  upstream already checked it, in case a future code path sets the
  field differently (a script, a migration, a bypassed validator).
- *Why window the snippet instead of sending the whole file?* — Cost
  and prompt size shouldn't depend on how large the file happened to
  be. `AI_CONTEXT.md` already commits to discarding the raw snippet
  after use — windowing extends that same instinct upstream.
- *Why does a 404 return null instead of throwing?* — A missing file
  is an expected outcome, not exceptional — the file path is a
  best-effort guess from a normalized stack trace, so it won't always
  match the repo's real structure.

---

## errorGroupService.enrichErrorGroup: orchestration lives in errorGroupService, not aiService (Task 13)

**Decision:** The Task 13 wiring — parse the stack for the top app
frame, conditionally fetch a GitHub snippet, build the prompt, call
Gemini, validate, and save `aiSummary` — lives in a new
`errorGroupService.enrichErrorGroup()` function, not inside
`aiService.js` or as a new top-level service/module.
`ingestController.ingestEvent` calls it fire-and-forget (not
`await`-ed) only when `isNewGroup` is true, after the 202 response has
already been sent. `githubService`/`aiService` are now required as
namespace objects (`const aiService = require('./aiService')`) rather
than destructured, matching how `ErrorGroup`/`ErrorEvent` were already
required — destructuring would have captured the exported functions
by value at require time, making them unmockable in tests without a
mocking library.

**Alternatives considered:**
1. A new `enrichmentService.js` / dedicated orchestration module.
2. Put the orchestration inside `aiService.js` itself.
3. Do the wiring directly in `ingestController`.

**Justification:** `errorGroupService.js` already owns every write to
`ErrorGroup` (the Task 9.3 upsert) — enrichment is just another
ErrorGroup write, triggered by the same "new group" signal
`recordEvent()` already computes. A new module (1) would be an
unrequested abstraction for one call site (`PROJECT_RULES.md` §2/§11).
Putting it in `aiService.js` (2) would break that file's Task
11-locked scope (`buildPrompt`/`callGemini`/`parseAndValidate` only,
per its own header comment) and would need `aiService` to reach into
`githubService` and `ErrorGroup`, which its docstring explicitly says
it doesn't do. Doing it directly in the controller (3) would violate
the layering convention (`ARCHITECTURE.md` §"Layering Convention") —
controllers never touch Mongoose, and this orchestration ends in a
`ErrorGroup.findByIdAndUpdate`.

**Justification (fire-and-forget placement):** The dispatch call sits
in `ingestController`, after `sendSuccess` but not `return`-ed or
`await`-ed, so the enrichment work starts only once the response has
already been handed to Express — matching `AI_CONTEXT.md`'s Dispatch
Model exactly (ingestion latency independent of LLM latency, no queue
infra needed at MVP scale).

**Shipped:** Task 13 — `errorGroupService.enrichErrorGroup()` added;
`ingestController.ingestEvent` dispatches it fire-and-forget for new
groups only. Unit tests added in `errorGroupService.test.js` (mocking
`githubService`/`aiService`/`ErrorGroup.findByIdAndUpdate`, same
approach as the existing `recordEvent` tests) covering: no-`githubRepo`
skips the snippet fetch, a configured `githubRepo` fetches using the
top app stack frame's file/line, an invalid/unparseable Gemini response
leaves `aiSummary` untouched, and a thrown Gemini error is caught
internally and never propagates. **Not yet run** — this
implementation environment has no `node_modules` installed and no
network access to `npm install`; run `npm test` locally before
considering this done. Live manual verification (real Gemini +
GitHub Contents API call against a project with `githubRepo` set,
and one without) is also still owed — see `STATUS.md`.

**Likely interview questions:**
- *Why not `await` the enrichment call at all, even briefly?* — Any
  `await`, even one that resolves fast in the common case, ties
  ingestion latency to LLM latency in the slow/failing case. Firing it
  after the response is sent removes that coupling entirely without
  needing a job queue.
- *What happens if `enrichErrorGroup` throws?* — It can't, out to its
  caller — the whole body is wrapped in one try/catch that logs and
  returns. That's deliberate: a fire-and-forget call with no `.catch()`
  at the call site would otherwise risk an unhandled promise rejection
  crashing the process.
- *Why only enrich new groups, never duplicates?* — `AI_CONTEXT.md`'s
  "Role of AI in This System": enrichment runs exactly once per new
  error group, not per event — re-running it on every duplicate
  occurrence would be wasted Gemini/GitHub calls for the same bug.

---

## Task 14: confidence values and affectedFile/affectedFunction source

**Decision:** `confidence` is a **binary** value, not a continuous
score: `0.8` when `enrichErrorGroup` actually fetched a GitHub
snippet and it grounded the prompt, `0.4` when it didn't (no
`githubRepo` configured on the project, the stack had no parseable
top frame, or the GitHub fetch itself failed/404'd). `affectedFile`
and `affectedFunction` are read directly off
`stackNormalizer.normalizeStack(stack).frames[0]` (`.file` /
`.functionName`) — both saved as `null`, not omitted, when the stack
didn't parse into any frames at all.

**Alternatives considered:**
1. A continuous confidence score (e.g. weighted by stack depth, how
   many frames were app-code vs. dependency code, or a rubric based on
   the model's own severity rating).
2. Ask the LLM to self-report confidence and use that directly.
3. Omit `affectedFile`/`affectedFunction` entirely rather than storing
   `null` when there's no top frame.

**Justification:** `AI_CONTEXT.md` already rejects (2) explicitly —
LLM self-reported confidence isn't reliably calibrated. A continuous
score (1) would need a rubric with no real signal behind it at MVP
scale — the only fact this codebase actually has about the
enrichment's grounding is binary (a real source snippet reached the
prompt, or it didn't), so a two-value confidence is the honest
reflection of that, not an under-engineered placeholder for something
fancier. Storing explicit `null` (not omitting the fields, rejecting
option 3) keeps `aiSummary`'s shape uniform across every saved
document — a UI reading this collection later doesn't need to
special-case "field present" vs. "field absent," just "is it null."

**Shipped:** Task 14 — `errorGroupService.enrichErrorGroup` now
computes all three fields and includes them in the saved `aiSummary`
alongside Task 13's `rootCause`/`severity`/`suggestedFix`. Tests
updated/added in `errorGroupService.test.js`: grounded path saves
`confidence: 0.8` with the real top frame's file/function; ungrounded
path (no `githubRepo`) saves `confidence: 0.4` with the top frame's
file/function still populated (a frame parsed fine, there just wasn't
a `githubRepo` to fetch from); a stack with no parseable frames at all
saves `confidence: 0.4` and both fields as `null`. **Not yet run** —
same sandbox limitation as Task 13 (no `node_modules`, no network);
run `npm test` locally. Live manual verification also still owed —
see `STATUS.md`.

**Likely interview questions:**
- *Why binary confidence instead of something more granular?* — There
  wasn't a second real signal to build a rubric on. A confidence score
  invented from nothing (stack depth, frame count) would just be
  noise dressed up as precision. The one fact that's actually true and
  useful — "did the model see real source or not" — is binary, so the
  score is too.
- *Why is `affectedFile` still populated when there's no `githubRepo`
  configured?* — `affectedFile`/`affectedFunction` answer "where did
  this stack trace point," which doesn't depend on GitHub access at
  all — that's a separate question from `confidence`, which answers
  "how much did the model actually see." A project with no
  `githubRepo` can still have a perfectly parseable stack frame.
- *Why store `null` instead of leaving the fields off the document?*
  — Uniform document shape. Every `ErrorGroup` with a non-null
  `aiSummary` has all five fields present, so any code reading this
  later checks one thing (`=== null`) instead of also handling
  "key doesn't exist."

---

## errorGroupService: retry-once on duplicate-key error

**Decision:** `errorGroupService.recordEvent()`'s atomic upsert now
catches a MongoDB `E11000` duplicate-key error specifically and
retries the `findOneAndUpdate` exactly once before surfacing the
error to the caller.

**Alternatives considered:**
1. Leave the rare race unhandled — it was already vanishingly
   unlikely.
2. Retry in a loop (more than once) until success.

**Justification:** The atomic upsert (see "Atomic upsert dedup"
above) closes the *normal* concurrent-duplicate race, but there's a
narrower edge case: two truly simultaneous upserts on a brand-new
fingerprint can still both attempt an insert before the unique index
has fully settled, and MongoDB itself can throw `E11000` in that
window rather than resolving it via the upsert semantics. Leaving this
unhandled (1) means a genuinely rare but real request can fail with a
500 for a condition that a second attempt would almost certainly
resolve cleanly, since the index has settled by then. A single retry
(not a loop, option 2) is proportionate — if a second attempt also
hits `E11000`, that points at a different, non-transient problem
worth surfacing rather than masking with more retries.

**Shipped:** This pass (P0) — `errorGroupService.recordEvent()` now
wraps the upsert in a helper that retries once on `E11000` before
rethrowing.

---

## Auth input validation: explicit `typeof` checks in authController

**Decision:** `authController.js`'s `login()`/`register()` now check
`typeof email === 'string'` (etc.) in addition to truthiness, matching
the pattern `ingestController.js` already used for `message`/`stack`.

**Alternatives considered:**
1. Leave truthiness-only checks in place (`!email` etc.).

**Justification:** A truthy-but-non-string value — e.g. `{ "$gt": ""
}` sent as `email` in a JSON body — passes a bare `!email` check and
is then handed to a Mongoose query (`User.findOne({ email })`), which
is a plausible NoSQL-injection-via-operator-object surface even though
Mongoose's own casting behavior limits how far it goes. `ingestController`
already guarded against exactly this shape of bug; the auth controllers
were the inconsistent outlier. Adding `typeof` checks closes the gap
with the existing `400` response shape, no new dependency, no
behavior change for any legitimately-typed request.

**Shipped:** This pass (P1) — `login()`/`register()` updated in
`authController.js`.

---

## apiKeyMiddleware: removal of inert timingSafeEqual check

**Decision:** The `crypto.timingSafeEqual` comparison in
`apiKeyMiddleware.js` — previously run *after* `Project.findOne({
apiKeyHash })` already matched — has been removed. The comment above
it, which described it as "defense in depth," has been replaced with
one explaining that the hash-indexed lookup is the actual (and only)
security boundary here.

**Alternatives considered:**
1. Leave it in place as harmless-but-reassuring extra code.
2. Replace it with a different timing-safe mechanism.

**Justification:** By the time `timingSafeEqual` ran, `project` was
already the specific document Mongo matched on `apiKeyHash` equality —
comparing `incomingHash` against `project.apiKeyHash` at that point
compares a value against itself and can never be false. It protected
against nothing; the actual security-relevant operation is the DB's
own indexed equality lookup, which happens once and isn't something an
attacker can meaningfully time from outside. Leaving it in (1) is
worse than removing it: it reads as a real security control to a
future reader (including in interviews) when it wasn't one, which is
a bigger risk than the few lines of code it costs. There's no real
attack here to defend against with a different mechanism (2) either —
this isn't a byte-by-byte secret comparison, it's a post-hoc no-op.

**Shipped:** This pass (P1) — inert check and its misleading comment
removed from `apiKeyMiddleware.js`; comment replaced. All 5 original
manual test cases (valid key, missing header, malformed key, wrong
key, deleted-project key) re-confirmed unaffected by the removal.

---

## Rate limiting: login and ingestion, using the already-declared dependency

**Decision:** Added `server/middleware/rateLimiter.js`, exporting a
strict limiter for `POST /api/auth/login` and a generous limiter for
`POST /api/events`, both built on `express-rate-limit` (already a
declared dependency, previously unused).

**Alternatives considered:**
1. Leave rate limiting entirely for Task 21, as originally scheduled.
2. A single shared limiter config for both routes.

**Justification:** No rate limiting existed anywhere despite the
dependency already being declared and the blueprint explicitly calling
out login and ingestion. The login exposure — brute-forceable with no
limiter — is live today, not a future-milestone concern, so pulling
the rate-limiting portion of Task 21 forward now (1, rejected) closes
a real, currently-open hole rather than waiting. A single shared
config (2, rejected) doesn't fit: login needs to be strict (a human
mistyping a password a handful of times is normal; hundreds of
attempts per IP is not), while ingestion needs to be generous enough
not to throttle a legitimately bursty client (the demo app fires
several events in quick succession) while still capping genuine abuse.

**Configuration:**
- Login: 5 attempts / 15 minutes per IP. Generous enough that a human
  who mistypes their password a few times in a row is never
  incorrectly blocked, strict enough that online brute-forcing a
  single account becomes impractical.
- Ingestion: 100 requests / minute per IP. Comfortably above the demo
  app's burst pattern (a handful of requests in a tight loop across 3
  routes), while still capping a client sending at a rate no
  legitimate error-reporting integration would sustain.

Both limiters use `express-rate-limit`'s in-memory store — the honest
answer to "how does this behave behind a load balancer" is "it
doesn't, per-instance only"; a Redis-backed store is the named next
step if this needs to scale across multiple instances (not built now,
per this project's restraint-over-premature-infrastructure
philosophy).

**Deferred:** the remaining scope of Task 21 (payload field-length/
shape validation beyond the existing 100kb global body-size cap) stays
deferred — this pass only pulls the rate-limiting portion forward.

**Shipped:** This pass (P1) — `server/middleware/rateLimiter.js`
added; wired into `authRoutes.js` (login only) and `ingestRoutes.js`.

---

## `httpResponse` helper: response-shaping only, not Task 20

**Decision:** Added `server/utils/httpResponse.js` exporting
`sendSuccess(res, statusCode, data)` / `sendError(res, statusCode,
message)`, used to replace the duplicated
`res.status(...).json({ success, ... })` blocks across
`authController.js`, `projectController.js`, and `ingestController.js`
(duplicated 7 times before this change).

**Alternatives considered:**
1. Leave the duplication in place — small per-instance, but
   repeated identically across three files.
2. Do this as part of a broader `AppError`/`catchAsync` refactor now,
   ahead of Task 20's scheduled slot for it.

**Justification:** The duplication (1) is exactly the kind of
narrowly-scoped maintainability fix worth making without waiting for a
bigger refactor — every endpoint's response shape stayed byte-for-byte
identical before and after, confirmed for each route. This is
explicitly **not** Task 20's `AppError`/`catchAsync` refactor (2,
rejected for this pass): no custom `Error` subclasses, no `catchAsync`
higher-order function, no change to how errors are thrown or caught —
only the final response-shaping step is deduplicated. A future session
should not read this change as "Task 20 already done"; plain try/catch
throughout controllers remains the standard until Task 20's actual
scope lands.

**Shipped:** This pass (P2) — `server/utils/httpResponse.js` added;
`authController.js`, `projectController.js`, `ingestController.js`
refactored to use it. Every endpoint's JSON response shape verified
unchanged.

---

## ErrorEvent: reconcile schema with documented intent

**Decision:** `server/models/ErrorEvent.js` now includes `maxlength:
50` on `env` and a compound index `errorEventSchema.index({
errorGroupId: 1, receivedAt: -1 })` — both already described in
`DATABASE.md` but never actually implemented in the model file.

**Alternatives considered:**
1. Correct `DATABASE.md` to match the code instead (remove the
   claims), since the code is what actually runs.

**Justification:** The compound index is genuinely useful for the
"recent events per group" query pattern `DATABASE.md` already
describes as powering the dashboard's Error Detail View — it was a
real, intended design that simply hadn't been typed into the model
file yet, not a claim that should be walked back. Implementing it (2,
chosen) closes the doc/code mismatch in the direction that actually
delivers the intended behavior, rather than just making the
documentation quietly less ambitious.

**Shipped:** This pass (P0) — `env`'s `maxlength: 50` and the compound
index added to `server/models/ErrorEvent.js`.

---

## Task 17: `GET /api/projects/:id/groups` built mid-task, not deferred

**Decision:** Task 17 ("Dashboard + ProjectDetail pages, project
list, error group table") turned out to depend on an endpoint —
`GET /api/projects/:id/groups` — that `API.md`'s "Not Yet Implemented"
list correctly flagged as absent, and that was confirmed absent in the
actual server code (only the `ErrorGroup` model and the internal
enrichment service existed; no route/controller). Rather than silently
inventing a client-side shape against a nonexistent endpoint, or
quietly narrowing Task 17's scope to skip the error group table, this
was flagged to the user as a blocker before any client code was
written. Chosen path: build the endpoint now, as part of this task,
then continue with the originally planned client pages.

**Alternatives considered:**
1. Ship only the Dashboard (project list) this task, defer
   ProjectDetail/error table to a follow-up once the endpoint exists.
2. Ask the user how to proceed (chosen).

**Justification:** Task 17's own title bundles both pages as one
deliverable; splitting it would leave a half-finished task checked off
and create an implicit new task nobody put on the roadmap. The
endpoint itself is small (list + shape, mirroring
`projectService.listProjects`'s existing pattern exactly) and the
ownership-check logic already existed via `projectService.getProject`
— reusing it kept this from becoming a bigger change than the task
warranted. This is the same "stop and ask rather than guess" instinct
`PROJECT_RULES.md` already calls for when documentation and code
disagree; here it was documentation (accurately) flagging code that
didn't exist yet, which is a normal, expected state for the
"Not Yet Implemented" section to describe — not itself a sign of
drift.

**List-shaping decision:** `errorGroupService.listErrorGroups`
returns `stackSample` omitted and, when `aiSummary` exists, only
`severity` + `rootCause` — not `suggestedFix`/`confidence`/
`affectedFile`/`affectedFunction`. This mirrors `projectService`'s
existing shaping philosophy (never return more than a given view
needs) and reserves the full `aiSummary` for Task 19's
ErrorGroupDetail page via the still-not-yet-built
`GET /api/groups/:id` — so that endpoint has a reason to exist rather
than being redundant with this one.

**Shipped:** This pass — `errorGroupService.listErrorGroups(projectId)`
(new), `projectController.listProjectGroups` (new, reuses
`projectService.getProject` for the ownership check), `GET /:id/groups`
route added to `projectRoutes.js`, `API.md` updated (moved from Not Yet
Implemented to a full endpoint entry), 3 new unit tests in
`errorGroupService.test.js` (filter/sort correctness, list-shaping,
aiSummary field-trimming) — all 13 server tests pass. Not verified:
live behavior against a real Atlas-backed server (no network path to
Atlas from the sandbox — confirmed via a direct connection attempt
that timed out, not skipped).

---

## Task 18: ownership check for group status updates

**Decision:** `PATCH /api/groups/:id/status` (new in `groupController`/
`groupRoutes`, mounted at `/api/groups`) enforces ownership by first
fetching the `ErrorGroup` by `:id`, then running a scoped
`Project.findOne({ _id: group.projectId, ownerId })` query — the same
`findOne({ _id, ownerId })` shape `projectService.getProject` already
uses — and treating a `null` result there as not-found-or-not-yours,
identically to every project route's collapsed 404.

**Why this couldn't be a single scoped query like the project routes:**
`projectService.getProject` scopes directly on `Project` because
`ownerId` lives on that same document. `ErrorGroup` has no `ownerId`
field — its only identity/ownership link is `projectId`, one hop away
from the user. A single-collection scoped query the way `getProject`
does it isn't available here without denormalizing `ownerId` onto
every `ErrorGroup`, which was rejected (see Alternatives).

**Alternatives considered:**
1. Denormalize `ownerId` onto `ErrorGroup` so `findOneAndUpdate({ _id,
   ownerId })` could scope and update in one atomic call. Rejected:
   this is the exact kind of "while I'm in here" schema change
   `PROJECT_RULES.md` §2 rules out unprompted — it would touch the
   locked `ErrorGroup` schema and the dedup upsert path (Task 9) for a
   single new endpoint, and would introduce a second source of truth
   for ownership that could drift from `Project.ownerId` if a project
   were ever reassigned.
2. Fetch the group unscoped, then compare `group.projectId` against a
   project the caller fetched separately, checking equality in
   application code. Rejected: this is the literal fetch-then-check
   anti-pattern `PROJECT_RULES.md` §11 calls out — the authorization
   decision would live in an `if` statement instead of a database
   query, which is easier to accidentally omit or get wrong on a
   future edit.
3. Two-step lookup where the *second* query (`Project.findOne`) is the
   one that's ownership-scoped, and its result — not a field
   comparison — is what the function branches on (chosen).

**Justification:** Option 3 keeps the actual security boundary as a
database-level scoped query, matching the pattern used everywhere else
in this codebase, while being honest that a single round-trip isn't
possible without a schema change nobody asked for. The first query
(`ErrorGroup.findById`) only ever learns `projectId` — it makes no
authorization decision itself and nothing is mutated until the second,
scoped query confirms ownership.

**Shipped:** Task 18 — `errorGroupService.updateGroupStatus` (new),
`groupController.updateStatus` (new), `groupRoutes.js` (new, mounted at
`/api/groups` in `app.js`), client: `ProjectDetailPage.jsx`'s status
column changed from static text to a `<select>` wired to the PATCH,
with a row-scoped disabled state and a page-level `statusError` for
failed updates. 3 new unit tests in `errorGroupService.test.js`
(owned-group happy path incl. `statusHistory` append, group-not-found
short-circuits before querying `Project`, group-exists-but-not-yours
never saves) — all 16 server tests pass. Client: `npm run build`
succeeds (89 modules, no errors). **Manually verified by the user
against a live local server + Atlas:** two-call PATCH sequence
(`resolved` then `ignored`) confirmed `statusHistory` accumulates to 2
entries rather than being overwritten, and `lastSeen` stayed unchanged
across both; bad-`status` → `400`; nonexistent group id → `404`;
dashboard `<select>` change survived a full page refresh. Task fully
closed.

---

## Task 20.3: project input validation — closing the typeof gap

**Decision:** `projectController.createProject` and `updateProject`
now reject a truthy-but-non-string `name`, and reject a non-string,
non-null/non-undefined `githubRepo`, before either reaches
`projectService`. `updateProject` had no input validation at all
before this pass — `name`/`githubRepo` went straight from `req.body`
to the service layer, relying entirely on `Project.js`'s own schema
validators (which only run once Mongoose actually attempts the
write).

**Alternatives considered:**
1. Leave it to the schema — `Project.js`'s `match` validator already
   rejects a malformed `githubRepo` string, and `required` catches a
   missing `name`.
2. Adopt a validation library (`express-validator`/`Joi`/`zod`) across
   all controllers as part of this pass.

**Justification:** (1) doesn't fail closed the same way for a
truthy-but-non-string value — e.g. `{ "$gt": "" }` sent as `name` —
since that's not a format the `match` regex or `required` check is
built to catch, and it's the same NoSQL-injection-shaped-object
concern already fixed in `authController` (see "Auth input
validation: explicit `typeof` checks in authController"). This pass
extends that exact precedent to the two project endpoints that were
still missing it, rather than re-deriving a new approach. (2) was
rejected for the same reason it was rejected for auth: no new
dependency for a check this mechanical, and mixing one library-driven
controller with several hand-rolled ones would be a worse
inconsistency than the one being fixed (see PROJECT_RULES.md §11 on
premature abstraction). `githubRepo`'s *format* (not just its type)
stays exclusively the schema's job — this pass only adds the
type-safety net one layer up, it doesn't duplicate the regex.

Deliberately out of scope for this pass: a "no-op PATCH" check
(rejecting a request where neither `name` nor `githubRepo` is
present). That's a business-logic nicety, not a type-safety gap, and
wasn't part of what this pass was asked to close — noted as a
possible future follow-up, not implemented.

**Shipped:** This pass — `createProject`/`updateProject` in
`projectController.js`. Verified with a direct in-process call
(fake `req`/`res`, no Express/DB) confirming all four new branches
return `400` before calling `projectService`; existing 19-test server
suite (`npm test`) still passes unchanged.

---

## Task 22: cursor pagination on the group list endpoint — compound `{lastSeen, _id}` cursor, not offset/skip or `lastSeen` alone

**Decision:** `errorGroupService.listErrorGroups(projectId, { limit,
cursor })` now paginates via an opaque base64-encoded cursor token
carrying `{ lastSeen, id }` of the last row on the previous page.
Sort order is `{ lastSeen: -1, _id: -1 }` — `_id` added purely as a
tie-breaker, not because insertion order otherwise matters. The query
for "the next page" is a compound `$or`: `lastSeen < cursor.lastSeen`
OR (`lastSeen == cursor.lastSeen` AND `_id < cursor.id`). Page size
defaults to 20, is caller-adjustable via `limit`, and is capped at 100.
The service fetches `pageSize + 1` rows to determine `nextCursor`
without a separate `count` query.

**Alternatives considered:**
1. Offset/skip pagination (`.skip(n).limit(pageSize)`).
2. Cursor on `lastSeen` alone, no tie-breaker.
3. Expose the cursor as raw, inspectable fields (e.g.
   `?lastSeen=...&id=...`) instead of an opaque token.

**Justification:** (1, rejected) — `.skip()` still has to walk and
discard every skipped document server-side, so cost grows with page
depth; more importantly, it's *unstable* under concurrent writes:
ingestion pushes new groups to the top of the `lastSeen`-descending
order constantly, so a `.skip(20)` for "page 2" can silently
duplicate or skip a row if a write lands between two page requests.
Cursor pagination anchors each page to a specific document identity,
so this doesn't happen. (2, rejected) — `lastSeen` is not guaranteed
unique: two distinct `ErrorGroup`s can be updated in the same
millisecond (e.g. two different errors deduped/bumped back-to-back
during a burst), and a cursor built on a non-unique key can skip or
repeat rows exactly at that boundary. `_id` is guaranteed unique and
monotonically increasing, so it's a correct, cheap tie-breaker without
inventing a new indexed field. (3, rejected) — an opaque token means
callers can't construct or mutate a cursor by hand (e.g. hand-editing
a `lastSeen` query param to skip around), and it keeps the encoding
free to change later (e.g. adding a third tie-break field) without
being a breaking API change, since callers never inspect the token's
internal shape.

**Known, deliberately out-of-scope consequence:** this task is
backend-only per the roadmap. The current frontend
(`ProjectDetailPage.jsx`) calls this endpoint with no `limit`/`cursor`
and never reads `nextCursor` back, so any project with more than the
default 20 groups will only ever show its first page in the UI until
the client is updated to actually paginate. This is flagged in
`STATUS.md`'s Known Open Issues rather than silently shipped — it's
the expected shape of a backend-only pagination task, not an
oversight, but it's a real, currently-live limitation worth surfacing
rather than letting it be discovered later.

**Shipped:** This pass — `errorGroupService.listErrorGroups` (cursor
encode/decode, compound sort+filter, page-size validation) and
`projectController.listProjectGroups` (passes `req.query.limit`/
`req.query.cursor` through, translates `INVALID_LIMIT`/
`INVALID_CURSOR` service errors into `400`s). Verified: 22-test server
suite (`npm test`) passes, including 3 new/updated tests covering the
`hasMore`/`nextCursor` trim behavior, invalid-limit rejection, and
invalid-cursor rejection. Also confirmed against a live local server
by the user: first page and `limit=1` behavior, following a real
`nextCursor` to a genuinely distinct second group (via the demo-app's
`/crash/range-error` route), and both `400` error cases. That live
test surfaced an unrelated local config issue, not a code bug —
`demo-app/.env`'s `FAULTLINE_API_KEY` didn't match the project under
test, so a new error briefly appeared to "not show up" in pagination
when it had actually ingested into a different project entirely (see
Known Open Issues in `STATUS.md`).

**Likely interview questions:**
- *Why cursor pagination instead of offset/skip?* — Stability under
  concurrent writes and no linear skip-cost at depth; see
  Justification (1) above.
- *Why not just sort on `lastSeen`?* — Not a unique key; two groups
  can share a millisecond. See Justification (2).
- *What happens if a group's `lastSeen` changes between two page
  requests (e.g. a new event bumps it)?* — If it moves to before the
  cursor position in sort order, it may appear again on a later page
  (temporary duplicate); if it moves to after, it won't be re-skipped
  incorrectly, since the cursor comparison is still evaluated fresh
  each request. This is standard cursor-pagination behavior under a
  live-updating dataset, not a bug specific to this implementation.

---

## Task 23: dark theme + monospace tokens + table polish, and `POST /api/projects/:id/simulate` for the "Simulate Error" button

**Decision:** Two parts.

1. **Client-side theme (`client/src/index.css`, imported once in
   `main.jsx`):** a single global stylesheet, plain CSS custom
   properties, no framework added. Dark graphite palette (`#14171c`
   background, `#1b1f26` surfaces, `#2a2f38` hairline borders, `#5fb3b3`
   teal accent) — deliberately not pure black and not the neon-
   acid-green dark-mode default. A clean sans (`var(--font-sans)`) for
   UI chrome (nav, headings, buttons, labels); monospace
   (`var(--font-mono)`) specifically for content that IS data — error
   messages, stack traces, counts, timestamps, the revealed API key,
   status/severity values — not applied globally. Severity and status
   render as small colored pill badges (`.badge-severity-*`,
   `.badge-status-*`) rather than plain text, since those are the two
   things a user scans a table for fastest. Tables got a dedicated
   `.table-wrap`/sticky-header/row-hover treatment across all three
   list views (Dashboard's project list, ProjectDetail's group table,
   GroupDetail's event table).
2. **`POST /api/projects/:id/simulate` (new endpoint) backing the
   "Simulate Error" button:** JWT-authed, ownership-scoped exactly like
   every other project route (reuses `projectService.getProject`, same
   pattern as `listProjectGroups`). On success, calls the *same*
   `errorGroupService.recordEvent` — and, on a new group,
   `enrichErrorGroup` — that `ingestController.ingestEvent` calls for
   real ingestion. One of a small fixed set of canned
   message/stack pairs (`projectController.js`'s `CANNED_ERRORS`) is
   chosen at random per call. `ProjectDetailPage.jsx`'s button calls
   this endpoint, then refetches the group list so the affected row
   (new or duplicate) appears/updates immediately.

**Alternatives considered (for the button):**
1. Point the button at the existing standalone `demo-app` (already has
   `/crash/*` routes reporting to Faultline with its own configured API
   key) — no new backend code at all.
2. The chosen approach: a new JWT-authed endpoint reusing the real
   ingestion services.
3. Store/expose a project's raw API key after creation so the
   dashboard could call `POST /api/events` directly with it.

**Justification:** (1, rejected) — this would only ever demo a
separate, unstyled Express app on a different port, requires that app
to be running locally, and doesn't exercise anything about Faultline's
own backend from the dashboard's perspective; a weaker interview demo
("here's a link to another app") than clicking a button and watching a
new `ErrorGroup` with an AI summary appear in the same view. (3,
rejected) — `apiKeyHash` is a one-way hash specifically so the raw key
is never recoverable after creation (see "API key hashing" decision);
reversing that for developer convenience would undermine the actual
security property, not just relax a formality. (2, chosen) — reuses
100% of the existing dedup/fingerprint/AI pipeline through a new,
narrow, ownership-scoped auth path; no new business logic, no new
model, no duplicated dedup code — extends the existing pattern
(`listProjectGroups`'s ownership-check shape) rather than re-deriving
one, per `PROJECT_RULES.md` §11.

**Shipped:** This pass —
`server/controllers/projectController.js` (`CANNED_ERRORS`,
`simulateError`), `server/routes/projectRoutes.js`
(`POST /:id/simulate`), `client/src/index.css` (new file, full token
system), `client/src/main.jsx` (imports it),
`client/src/pages/{LoginPage,RegisterPage,DashboardPage,
ProjectDetailPage,GroupDetailPage}.jsx` (all restyled onto the new
classes; `ProjectDetailPage.jsx` additionally gets the Simulate Error
panel and its handler). Verified: `projectController.js`/
`projectRoutes.js` load without throwing; 22-test server suite
(`npm test`) passes unchanged (no existing test touches
`projectController`, so none needed updating). All client `.jsx`
files parse cleanly under a Babel JSX transform (`@babel/preset-react`)
run outside the project's own `node_modules`, since the sandboxed
`node_modules`' native Rollup/esbuild binaries were built for a
different platform and couldn't run a real `vite build` in this
environment — see manual test instructions for what's still owed
against a live server. No automated test exists for `simulateError`
itself (matches the project's existing test coverage, which has no
controller-level tests for any project route).

**Known, deliberately out-of-scope consequences:**
- `simulateError` has no automated test — same gap as every other
  `projectController` function; not newly introduced by this task.
- The canned errors' fake file paths (`/app/src/services/...`) won't
  match any real project's `githubRepo`, so GitHub-grounded enrichment
  will always fall back to stack-trace-only confidence (`0.4`) for
  simulated errors, never the grounded `0.8` — expected, not a bug;
  simulated errors are for demonstrating the pipeline shape, not for
  testing GitHub grounding specifically (use the real `demo-app` for
  that, per its own README).

**Likely interview questions:**
- *Why not let the button call `/api/events` directly?* — It's
  API-key-authenticated by design, and a project's raw key is
  one-way-hashed at creation specifically so it's never recoverable
  (see "API key hashing" decision) — reusing it from a JWT session
  would mean storing or re-deriving something deliberately designed
  not to be. See Justification (3) above.
- *Why monospace only on some elements, not the whole page?* — The
  content that's inherently code-like (messages, stacks, counts,
  timestamps) benefits from a monospace's fixed-width alignment and
  "this is data" visual signal; headings, nav, and buttons are UI
  chrome, not data, and read better in a proportional face.
- *Why badges for severity/status instead of colored text?* — A pill
  shape is scannable at a glance across a table column in a way plain
  colored text isn't — this was chosen because severity/status are the
  two fields a user needs to triage a list of errors fastest.

---

## Shipped Log

Chronological, most-recent-first, entries with no dedicated decision
above. Migrated from `CHANGELOG.md`.

- **Task 29.1** — `services/trendService.js`: pure function
  (`computeTrend`), no Mongo/I/O, taking a plain array of event
  timestamps plus an injectable `now` so it's unit-testable without a
  DB. Implements the algorithm locked into `TASKS.md`'s Task 29 entry:
  baseline = trailing-24h event count (in the 24 full hours before the
  current, in-progress hour) divided by 24; a group spikes when its
  current-hour count both exceeds `baseline * spikeMultiplier`
  (default 3x) and clears an absolute `minCountFloor` (default 5) —
  the floor is what stops a 1/hr baseline going to 3 in an hour from
  registering as "a 3x spike" on pure noise. A group whose earliest
  known event is younger than the 24h baseline window reports
  `status: 'insufficient_history'` rather than computing a baseline
  over a partial window (which would make a brand-new group's first
  few events look like an immediate, permanent spike). A trailing-24h
  window with zero events is a legitimate baseline of 0, distinct from
  "insufficient history" — handled via `multiplierObserved: Infinity`
  when baseline is 0 but the current hour has activity. Verified: 9
  new unit tests (`tests/trendService.test.js`) covering no-history,
  under-24h-old groups, a flat 1/hr baseline with no spike, the exact
  "1/hr → 3 in an hour" noise case from the spec (correctly does NOT
  spike), a real spike clearing both the multiplier and the floor, a
  zero-baseline burst both above and below the floor, custom
  multiplier/floor overrides, and mixed Date/ISO-string/epoch-ms input
  — full 31-test server suite passes unchanged.
- **Task 21** — Added field-level payload caps to `POST /api/events`:
  `message` capped at 1000 characters, `stack` at 10,000, both
  returning `400` when exceeded. Separate concern from the existing
  global `express.json({ limit: '100kb' })` body cap in `app.js`,
  which bounds the whole request rather than either field
  individually. `env`/`metadata` deliberately left unvalidated by this
  task — that's an existing, separate decision (accept-but-ignore,
  forward-compatible), not something Task 21 reopens. Verified:
  in-process calls confirm both new `400` branches fire correctly and
  a payload exactly at both boundaries passes validation; 19-test
  server suite passes unchanged. Manual live-server test confirmed by
  the user.
- **Fix: `client/src/App.jsx` regression** — the file had been
  accidentally overwritten with a near-verbatim copy of
  `server/app.js` (Express server code) during the Task 20.2 commit,
  leaving the client with no real `App` component (`require` isn't
  defined in the browser/Vite context, so nothing rendered — blank
  page). `server/app.js` itself was untouched and correct throughout;
  this was a stray copy-paste into the wrong file, not a missing edit
  to `app.js`. Restored `App.jsx` to its pre-corruption content (the
  router/`ProtectedRoute` setup from Task 16-19) from git history.
- **Task 20.2** — Controllers (`authController`, `projectController`,
  `groupController`, `ingestController`) refactored to wrap their
  async handlers in `catchAsync`, removing duplicated top-level
  try/catch. Not a wholesale removal: `groupController` and
  `projectController` deliberately keep a local `try/catch` around
  their service calls specifically to translate a Mongoose `CastError`
  (malformed `:id`) into a resource-specific 404 message (e.g.
  "Project not found") — the centralized `errorMiddleware`'s own
  `CastError` handling only has a generic "Resource not found"
  fallback, and only the controller layer knows which resource name to
  use. Verified: 19-test server suite passes; `app.js` loads with all
  routes mounted.
- **Task 20.1** — Added `utils/AppError.js` (operational-error class,
  `isOperational: true`) and `utils/catchAsync.js` (async handler
  wrapper forwarding rejections to `next`), plus
  `middleware/errorMiddleware.js` as the single centralized error
  handler (replacing the Task-1 stub), mounted last in `app.js`.
  Handling order: `AppError`/anything `isOperational` → trusted
  message + its own status code; Mongoose `CastError` → generic 404;
  Mongoose `ValidationError` → 400 with concatenated field messages;
  anything else → full stack logged server-side only, generic 500 to
  the client (never leaking internals).
- **Task 19** — `GroupDetailPage.jsx` added on the client (AI summary
  panel rendered as a checklist, per-group event list, sparkline of
  recent event counts), backed by a new
  `errorGroupService.getGroupDetail({ ownerId, groupId })` (ownership
  check via scoped `Project.findOne`, same pattern as Task 18's
  `updateGroupStatus`) and `groupController.getGroupDetail`, mounted at
  `GET /api/groups/:id` alongside the existing status-update route.
- **This pass** — `demo-app/README.md` given real content (usage of
  the three crash routes, how it reports to Faultline, required env
  vars) — previously still a placeholder despite `HANDOFF.md` having
  claimed otherwise (see this pass's summary, Bug #3).
- **This pass** — stray, unexecuted note removed from `docs/TASKS.md`.
- **Task 10** — `demo-app/index.js`: Express app with three routes
  (`/crash/type-error`, `/crash/range-error`, `/crash/custom`), each
  throwing a distinct error, forwarded fire-and-forget to `/api/events`.
  Manually verified end-to-end: repeated hits on one route collapsed
  into one `ErrorGroup` (`count: 3`); the other two each produced their
  own `ErrorGroup` (`count: 1`); 5 total `ErrorEvent` docs split
  3/1/1, all correctly linked.
- **Task 7 complete** — Ingestion endpoint skeleton fully closed
  (Task 7.1 subtask entry is in the "Ingestion endpoint is a skeleton"
  decision above).
- **Task 6 complete** — `apiKeyMiddleware` closed, all 5 manual cases
  passed (see "API key hashing" decision above for the 6.1 subtask).
- **Task 5 complete** — Project model + CRUD + API key generation/
  hashing, fully closed across subtasks 5.1–5.5, verified end-to-end
  against a live MongoDB Atlas dev cluster including enumeration-
  avoidance `404` behavior.
- **Task 5.5** — Full CRUD lifecycle verification: no new source
  files, verification-only. Full create → list → get → update →
  delete → post-delete-404 sequence run in one continuous pass against
  live Atlas; `updatedAt` correctly bumped on `PATCH`, `createdAt`
  stayed fixed, `DELETE` returned `204` empty body, post-delete `GET`
  returned generic `404`.
- **Milestone 1 complete** — Backend Foundation: Tasks 1–4 done
  (Express skeleton, MongoDB connection + User model, register/login
  with bcrypt + JWT, JWT auth middleware with a protected `/me`
  route). Full auth flow verified end-to-end against live Atlas.
- **Task 4 complete** — `authMiddleware` + protected route guard (see
  "authMiddleware" decision above for the 4.1/4.2 subtask entries).
- **Task 3 complete** — Register/login endpoints (bcrypt + JWT), full
  flow verified end-to-end: successful register/login, missing fields
  (400), Mongoose validation errors (400), duplicate email (409),
  wrong password (401), nonexistent email (401, identical to wrong
  password).
- **Task 3.1** — `server/utils/generateToken.js`: pure JWT-signing
  helper, `sub` claim set to user ID, expiry from `config.jwtExpiresIn`.
  Manually verified: token generated and successfully decoded/verified
  with the configured secret.
- **Task 2 complete** — MongoDB connection + User model: full flow
  verified end-to-end against Atlas — connect on boot, create/read/
  delete, field validation, bcrypt hashing/comparison, and the unique
  email index enforced at the DB level (duplicate insert fails with
  Mongo error 11000, not just app-level validation).
- **Task 2.2** — `server/models/User.js` schema (`name`, unique
  `email`, `passwordHash`, `createdAt` via `{ timestamps: { createdAt:
  true, updatedAt: false } }`). Manually verified: create/read/delete
  round-trip, validation, unique-email index.
- **Task 2.1** — `server/config/db.js`: Mongoose connection helper,
  exits process on connection failure, logs on disconnect;
  `server.js` updated to `await connectDB()` before listening.
  Connected to a MongoDB Atlas M0 (free tier) dev cluster from day
  one, avoiding a dev/prod parity gap. Manually verified: `npm run dev`
  prints the connection line before the listening line.
- **Task 1 complete** — Monorepo init & Express skeleton: full backend
  skeleton verified end-to-end from a clean `npm run dev` boot —
  `GET /health` → 200, `POST /health` → 404 (method-matching
  confirmed, not just path-matching), unknown routes → 404.
- **Task 1.4** — `server/server.js`: starts the Express app, guards
  against `unhandledRejection`/`uncaughtException` by logging and
  exiting cleanly rather than limping along in a broken state.
  Manually verified via `npm run dev` + a `/health` request through
  the real bootstrap path.
- **Task 1.3** — `server/app.js`: helmet security headers, CORS
  restricted to `config.clientOrigin`, JSON/urlencoded body parsing
  capped at 100kb, morgan logging (`dev` locally / `combined` in
  production), `GET /health`, 404 handler, stub centralized error
  handler (replaced by `AppError`/`catchAsync` in Task 20). Manually
  verified: `/health` returns 200, unknown routes return a 404 JSON
  body.
- **Known local-environment note** — on macOS (Monterey+), port 5000
  is claimed by AirPlay Receiver (`ControlCenter`), respawned by
  `launchd` even after `kill -9`. Local dev uses `PORT=5050` to avoid
  this; `.env.example`'s default of `5000` is unaffected since it's
  not a concern on Linux/CI/production hosts.
- **Task 1.2** — `server/config/env.js`: loads `.env` via dotenv,
  validates presence of `MONGODB_URI`/`JWT_SECRET` with a console
  warning (not a hard crash — `server.js` decides whether to refuse to
  start), exports a single typed `config` object.
- **Task 1.1** — Monorepo folder structure scaffolded
  (`server/{config,controllers,services,middleware,routes,models,
  utils}`, `client/` and `demo-app/` placeholders); `server/package.json`
  with core dependencies; `server/.env.example` documenting required
  env vars.

> Historical note, preserved from the old `CHANGELOG.md`: earlier
> entries in that file once claimed Task 1 was fully complete before
> the code was actually committed — an incorrect status line, since
> corrected. Flagging this here as the kind of drift this
> documentation restructuring exists to prevent going forward.