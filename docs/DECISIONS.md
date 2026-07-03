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