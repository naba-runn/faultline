# Faultline — Engineering Decisions

Format: decision, alternatives considered, justification. Added
whenever a non-trivial engineering choice is made, not for every line
of code.

---

## Password hashing: bcrypt in a Mongoose pre-save hook, not in the service layer

**Decision:** `User.js` hashes `passwordHash` in a `pre('save')` hook
(cost factor 12), and exposes `comparePassword()` as an instance
method. The auth service (Task 3) will call `User.create({ ...,
passwordHash: plaintextPassword })` and let the model handle hashing —
it never hashes passwords itself.

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
extra Date field, free via Mongoose's `timestamps` option. Nothing in
the architecture review's "locked in" list forbids this — the original
sketch simply predated CRUD being scoped.

## API key hashing: SHA-256, not bcrypt

**Decision:** `apiKey.js` hashes raw API keys with SHA-256
(`hashApiKey`), not bcrypt — a deliberate departure from the
password-hashing pattern in `User.js`.

**Alternatives considered:**
1. Reuse bcrypt for consistency with password hashing.
2. HMAC-SHA256 with a server-side secret pepper, for extra defense if
   the DB is compromised without the app server.

**Justification:** Bcrypt's deliberate slowness (cost 12 costs
~250-300ms/hash, see the password-hashing decision above) exists to
resist offline brute-forcing of *low-entropy, human-chosen* secrets.
An API key here is 256 bits of `crypto.randomBytes` — brute-forcing it
via hash speed is already infeasible regardless of hash function, so
bcrypt's slowness buys nothing and costs real latency on a path that
matters: `apiKeyMiddleware` (Task 6) will hash the incoming key on
*every* ingestion request, not once at login. SHA-256 is fast,
deterministic, and sufficient given the input entropy.

HMAC-with-pepper (option 2) is a genuinely stronger design — it means
a stolen DB alone (without the app's secret) doesn't let an attacker
directly compare hashes — but it's an added-complexity/marginal-benefit
tradeoff not clearly justified at this project's threat model (a
portfolio/demo project). Noting it here as the documented "what I'd
add for a real production system" answer, not building it now.

**Note for Task 6:** comparing the incoming key's hash against the
stored hash must use `crypto.timingSafeEqual`, not `===`, to avoid a
timing side-channel — flagging now so it isn't missed when
`apiKeyMiddleware` is built.

**Update (Task 6, done):** implemented as specified —
`apiKeyMiddleware.js` looks up the project by hash via
`Project.findOne({ apiKeyHash })`, then double-checks the match with
`crypto.timingSafeEqual` before attaching `req.project`. Both operands
are fixed 64-char hex SHA-256 digests, so the equal-length requirement
of `timingSafeEqual` is always satisfied. Manually verified: valid
key, missing header, malformed key, wrong key, and key belonging to a
deleted project all behave correctly (200 vs. uniform 401).

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
costs nothing for a legitimate user (their own client only ever
requests IDs it already knows about) and closes that enumeration
surface. Malformed ObjectIds (Mongoose `CastError`) get folded into
the same `404` for the same reason — a `400`/`500` there would
distinguish "well-formed but not yours" from "not even a real ID
shape," which is itself a smaller information leak.

**Implementation note:** this only works because every service
function scopes its Mongo query by `{ _id: projectId, ownerId }`
together, not `_id` alone followed by an ownership check in the
controller — a separate ownership check after a plain `findById`
would briefly fetch (and risk exposing via a bug) another user's
document before rejecting it. Scoping the query itself means Mongo
never returns another user's document to the service layer at all.

## Ingestion endpoint is a skeleton, not full ingestion — Task 7

**Decision:** `POST /api/events` currently validates (`message`,
`stack` required strings) and returns `202 Accepted` without writing
anything to the database.

**Justification:** `ErrorGroup`/`ErrorEvent` don't exist as models
until Task 9, and fingerprinting (what would determine *which*
`ErrorGroup` an event belongs to) doesn't exist until Task 8. Building
persistence now would mean guessing at a schema Task 9 is explicitly
responsible for designing, and likely redoing it. `202` rather than
`201` is deliberate: `201 Created` asserts a resource was created,
which would be false here — nothing is created yet, only accepted.

**Not yet validated:** `env` and `metadata` are accepted in the
request body but not validated or used. Their real shape depends on
what `ErrorEvent` (Task 9) actually needs; validating them now risks
locking in a shape that turns out wrong.

**For Task 8/9:** when persistence is added, decide there whether
malformed-but-present `env`/`metadata` should then start being
rejected, or silently ignored/coerced — not decided yet, deliberately
deferred alongside the schema itself.

## Stack fingerprinting: normalized top-frame signature (app frames only), not a hash of the raw stack

**Decision:** `stackNormalizer.js`'s `normalizeStack()` reduces a raw
stack trace to a signature built from up to 5 application-code frames
(dependency/runtime frames — `node_modules`, `node:`, `internal/` —
filtered out unless zero app frames remain), with each frame's file
path anchored to the *last* recognized project-root segment
(`server`/`client`/`src`/`app`/`lib`) rather than the full absolute
path. `fingerprintService` (Task 8.2) will hash this signature, not
the raw stack text.

**Alternatives considered:**
1. Hash the entire raw stack string as-is.
2. Hash only the error message + top single frame.
3. Anchor file paths on the *first* matching root-marker segment
   instead of the last.

**Justification:** Hashing the raw stack (option 1) makes every
occurrence of the "same" error a distinct fingerprint whenever the
absolute path differs — which it always will between a local machine,
Docker, and CI — defeating the point of deduplication. Filtering to
app-code frames means the same underlying bug still groups together
even if it surfaces through different dependency versions or internal
Node call paths on the way up. Capping at 5 frames balances two
failure modes: too few (option 2, 1 frame) risks merging genuinely
different bugs that happen to throw from the same function; too many
risks fragmenting the same bug across trivial call-path differences
further down the stack — 5 is a reasonable middle ground for a
portfolio-scale demo, not empirically tuned. Falling back to all
frames when zero app frames remain handles errors that originate
entirely inside a dependency, a legitimate case rather than one to
lose fingerprint fidelity over.

**Bug found during manual verification (option 3, corrected):** the
first implementation anchored on the *first* matching root-marker
segment. This silently broke cross-environment fingerprint stability
whenever the deploy root itself was also a marker word — e.g.
Docker's conventional `/app/server/services/foo.js` matched `app`
before reaching the real project root `server`, while the same file
locally at `/Users/x/faultline/server/services/foo.js` matched
`server` directly — producing two different signatures for the
identical bug. Switched to anchoring on the *last* matching marker,
verified by hand-testing the same logical stack under a simulated
local path and a simulated Docker path and confirming identical
signatures.

**Note for Task 8.2:** `fingerprintService` should combine this
signature with an extracted error *type* (e.g. `TypeError`, parsed
from `message`, not the full dynamic message text) before hashing —
the full message often contains request-specific dynamic values (IDs,
variable names) that would fragment the fingerprint for what's
otherwise the same bug.

## Fingerprint = hash(error type + normalized stack signature), not signature alone

**Decision:** `fingerprintService.generateFingerprint()` combines an
error type extracted from the message (`extractErrorType()`, matching
the conventional `SomeError:` prefix, falling back to a generic
`"Error"` bucket when no match) with `stackNormalizer`'s signature,
then hashes the combined string with SHA-256. If the signature is
empty (unparseable/missing stack), falls back to hashing the type +
raw message instead of type alone.

**Alternatives considered:**
1. Hash the normalized signature alone (no type).
2. Hash the full raw error message + signature.
3. On empty signature, still hash type-only rather than falling back
   to the message.

**Justification:** Signature-alone (option 1) can merge two genuinely
different bugs that happen to throw from the same line during a
refactor — e.g. a `TypeError` and a `RangeError` at the same call
site. Including the type (parsed, not the full message) fixes that
cheaply. Hashing the full raw message (option 2) reintroduces the
exact problem `stackNormalizer` was built to avoid — messages usually
carry dynamic values (IDs, user-specific text) that would fragment the
"same" bug into many fingerprints. Type-only on empty signature
(option 3) would collapse every stackless error in a project into one
fingerprint regardless of how different the underlying bugs are;
falling back to type + raw message instead preserves fidelity for that
edge case, same "fall back, don't lose fidelity" pattern used in
`stackNormalizer`'s frame filtering.

**Known limitation:** `extractErrorType()` only recognizes messages
following the conventional `SomeError: ...` shape ending in "Error".
Custom error classes that don't follow this convention (or errors
thrown as plain strings) fall into the generic `"Error"` bucket, which
slightly reduces fingerprint specificity for those cases. Not fixed
here — flagged as a known heuristic tradeoff, not a bug, since the
demo app and most real-world JS errors do follow the convention.

**Known limitation:** `extractErrorType()` only recognizes conventional
error name patterns. Non-conventional error names collapse into a
generic `"Error"` bucket. Accepted tradeoff, not scheduled for a fix.

## ErrorGroup uses firstSeen/lastSeen instead of Mongoose timestamps

**Decision:** `ErrorGroup` does not use `{ timestamps: true }`.
`firstSeen`/`lastSeen` fields cover that role instead, both defaulting
to `Date.now` on creation.

**Justification:** Mongoose's `updatedAt` bumps on *any* document
save. `lastSeen` has narrower, dedup-specific semantics — it should
only bump when a duplicate event arrives for an existing group (via
the Task 9.3 upsert's `$set`), not on unrelated edits like a status
PATCH (Task 18). Keeping both fields would let them drift apart and
raise the question of which one is authoritative; `firstSeen`/
`lastSeen` alone is the simpler, correct model.