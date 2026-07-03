# Faultline — Interview Notes

Likely interview questions + strong answers, recorded per feature as
it's completed. Written from the perspective of explaining a real
engineering decision, not reciting documentation.

---

## Feature: Register/Login (bcrypt + JWT) — Task 3

**Q: Where do you hash the password, and why there specifically?**
A: In a Mongoose `pre('save')` hook on the `User` model, not in the
auth service. Hashing is a data-integrity invariant of the model — no
code path, including a future seed script or admin tool, should ever
be able to persist a `User` with a plaintext password. Putting it in
the service only protects writes that happen to go through that one
function; putting it in the model makes it structural.

**Q: How do you prevent account enumeration on login?**
A: Both failure cases — email not found, and email found but wrong
password — return the identical response: `401` with `"Invalid email
or password"`. If the messages differed, an attacker could tell which
emails are registered just by watching which error comes back.

**Q: Why bcrypt cost factor 12 specifically?**
A: It's the commonly-cited floor for production-grade hashing on
current hardware, costing roughly 250-300ms per hash. Higher (14+)
buys marginal extra brute-force resistance at a latency cost that
isn't justified for this threat model — a portfolio/demo project, not
a system protecting financial data.

**Q: What does the JWT payload contain, and why?**
A: Just `{ sub: userId }` plus the standard `iat`/`exp` claims added
by the `jsonwebtoken` library. `sub` (subject) is the conventional JWT
claim name for "who this token is about," rather than a custom field
name — keeps it interoperable with anything else that reads JWTs.
Deliberately minimal: no email, no role, nothing that would go stale
if the user's data changes without the token being reissued.

---

## Feature: JWT Auth Middleware + Protected Route — Task 4

**Q: Walk me through what happens when a request hits a protected route.**
A: `authMiddleware` reads the `Authorization: Bearer <token>` header,
verifies the JWT signature and expiry via `jsonwebtoken`, then does a
DB lookup for the user referenced by the token's `sub` claim (also
stripping `passwordHash` from that read). If the user is found, it's
attached as `req.user` and `next()` is called; the actual route
handler never touches JWTs or Mongoose auth logic itself.

**Q: Why do you re-check that the user still exists, instead of just trusting the token?**
A: A JWT is a self-contained, cryptographically signed claim — it
stays valid until its expiry regardless of what happens to the
underlying account. If a user is deleted after a token was issued,
the token is still technically "valid" for the rest of its lifetime
unless something checks against the current DB state. Re-fetching the
user on every protected request closes that gap, at the cost of one
extra DB read per request — an acceptable tradeoff at this scale.

**Q: Do you distinguish "expired token" from "malformed/invalid token" in the response?**
A: No, deliberately — both return the same `401` with the same
message. `jwt.verify` throws for both cases, and there's no reason to
give a client (or an attacker holding a token they don't control the
validity of) more granular information about *why* their token
failed. The one case that does get a distinct message is "token valid
but the user no longer exists," since that's not information that
helps an attacker target someone else's account.

**Q: How would you test this without a frontend?**
A: Four `curl` cases against the same route: a valid token from a
real login (expect 200 + user), no `Authorization` header at all
(expect 401), a garbage token string (expect 401), and a token signed
with a real secret but an already-past expiry (`expiresIn: '-1s'`,
generated with a one-off script) — confirms the expiry check itself
works, not just "malformed tokens get rejected."



## Feature: Project Create + List — Task 5.3

**Q: Where does API key hashing happen, and why not in the model like password hashing?**
A: In `projectService.createProject()`, not a Mongoose hook. Password
hashing lives in the `User` model's `pre('save')` hook because
hashing is a data-integrity invariant of that model — no code path
should ever persist a plaintext password. API keys are different: the
*raw* key has to exist just long enough to return it to the caller
once, and that generation step is a business action (create a project,
mint a credential), not a model-level invariant. Putting key
generation in the service keeps the model dumb (it only ever sees the
already-hashed value) and keeps "generate + return once" as an
explicit, visible step in the service function rather than something
implicit in a save hook.

**Q: How do you make sure the raw API key is never accidentally persisted or logged?**
A: `Project.apiKeyHash` only ever receives the output of `hashApiKey()`
— the raw key never touches a Mongoose document. The service function
returns the raw key in its return value once, the controller passes
it straight through in the 201 response, and nothing else references
it. There's no `console.log` of request bodies in this path (morgan
logs method/path/status, not bodies).

**Q: Why is project creation behind JWT auth and not API-key auth?**
A: They're deliberately separate middlewares authenticating different
things. JWT (`authMiddleware`) authenticates a logged-in dashboard
user performing an action on their own account — creating a project is
exactly that. API-key auth (Task 6) will authenticate a program
sending error events, with no human logged in. Projects are things a
human creates about their own account, so they go through the human's
auth, not a project-scoped credential that doesn't exist yet at
creation time anyway (chicken-and-egg — you can't API-key-auth your
way into creating the thing that gives you an API key).