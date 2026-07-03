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