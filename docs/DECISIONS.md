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

## Password hashing: bcrypt in a Mongoose pre-save hook, not in the service layer

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

## Shipped Log

Chronological, most-recent-first, entries with no dedicated decision
above. Migrated from `CHANGELOG.md`.

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
  `server/{config,controllers,services,middleware,routes,models,
  utils}`, `client/` and `demo-app/` placeholders); `server/package.json`
  with core dependencies; `server/.env.example` documenting required
  env vars.

> Historical note, preserved from the old `CHANGELOG.md`: earlier
> entries in that file once claimed Task 1 was fully complete before
> the code was actually committed — an incorrect status line, since
> corrected. Flagging this here as the kind of drift this
> documentation restructuring exists to prevent going forward.