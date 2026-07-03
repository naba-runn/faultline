# Faultline — Database Design

**Status: `User` (Task 2) and `Project` (Task 5.1) models implemented.
`ErrorGroup` and `ErrorEvent` remain planned — implemented starting
Task 9.**

## Implemented Collections

### User (`server/models/User.js`)

```javascript
{
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  email: {
    type: String,
    required: true,
    unique: true,       // enforced as a real MongoDB unique index
    trim: true,
    lowercase: true,
    match: /^\S+@\S+\.\S+$/,
  },
  passwordHash: {
    type: String,
    required: true,      // bcrypt hash (cost 12), never plaintext at rest
  },
  createdAt: Date,        // via { timestamps: { createdAt: true, updatedAt: false } }
}
```

Verified manually:
- Create/read/delete round-trip against the Atlas dev cluster
- Field validation (invalid email format rejected)
- Password hashing: stored value is a bcrypt hash, `comparePassword()`
  correctly returns `true`/`false`
- **Unique email constraint enforced at the DB level**, not just app
  validation — duplicate insert attempts fail with Mongo error code
  `11000`, confirmed via direct test (not just assumed from the
  schema option)

See `docs/DECISIONS.md` for the reasoning behind hashing in the model
vs. the service layer, and the bcrypt cost-factor choice.

### Project (`server/models/Project.js`)

```javascript
{
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  apiKeyHash: {
    type: String,
    required: true,   // set in Task 5.2/5.3; raw key never persisted
  },
  githubRepo: {
    type: String,
    trim: true,
    default: null,
    match: /^[\w.-]+\/[\w.-]+$/,   // "owner/repo" only, optional
  },
  createdAt: Date,
  updatedAt: Date,   // via { timestamps: { createdAt: true, updatedAt: true } }
}
```

Verified manually:
- Valid project (with and without `githubRepo`) saves correctly
  against the Atlas dev cluster, with real `createdAt`/`updatedAt`
  timestamps
- Malformed `githubRepo` correctly rejected by the `match` validator
  (confirmed via `validateSync()` first, then a live save attempt)
- Missing `name` correctly rejected as required
- Read-back and delete round-trip confirmed

See `docs/DECISIONS.md` for why `Project` tracks `updatedAt` when
`User` deliberately doesn't.

## Planned Collections (not yet implemented)

```


ErrorGroup {
  _id, projectId (ref Project), fingerprint (indexed, compound unique with
  projectId), message, stackSample, status: enum[open, resolved, ignored],
  statusHistory: [{ status, changedAt }],
  aiSummary: { rootCause, severity, suggestedFix[], confidence, affectedFile,
  affectedFunction } | null,
  count, firstSeen, lastSeen
}

ErrorEvent {
  _id, errorGroupId (ref ErrorGroup), rawStack, env, metadata, receivedAt
}
```

## Key Design Decisions (locked in, implement as-is)

- **Compound index on `{ projectId, fingerprint }`**, unique. This is
  what makes dedup lookups fast and also what the atomic upsert relies
  on to prevent duplicate groups under concurrent writes.
- **Dedup writes use `findOneAndUpdate` with `upsert: true`**, never a
  read-then-write. First-occurrence detection reads `upsertedId` off
  the Mongo result, not a preceding `findOne`.
- **`aiSummary.confidence` is written by the server**, computed from
  whether the GitHub file fetch succeeded — never taken from the LLM's
  own output.
- **No raw source code snippet field.** The GitHub-fetched snippet is
  used in the AI prompt and then discarded, not persisted.
- **`statusHistory` is appended to, never overwritten**, on every
  status PATCH — this is the data source for the "resolved vs.
  reopened" analysis named as a future improvement.

Populated with real Mongoose schema code as each subsequent model task
lands (`ErrorGroup`/`ErrorEvent` in Task 9).