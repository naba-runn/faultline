# Faultline — Database Design

**Status: `User` (Task 2), `Project` (Task 5.1), `ErrorGroup`
(Task 9.1), and `ErrorEvent` (Task 9.2) models implemented. Only the
atomic-upsert wiring connecting them remains — Task 9.3.**

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

### ErrorGroup (`server/models/ErrorGroup.js`)

```javascript
const mongoose = require('mongoose');

const aiSummarySchema = new mongoose.Schema(
  {
    rootCause: { type: String },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
    },
    suggestedFix: [{ type: String }],
    confidence: { type: Number, min: 0, max: 1 },
    affectedFile: { type: String },
    affectedFunction: { type: String },
  },
  { _id: false }
);

const statusHistoryEntrySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['open', 'resolved', 'ignored'],
      required: true,
    },
    changedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

const errorGroupSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'projectId is required'],
      index: true,
    },
    fingerprint: {
      type: String,
      required: [true, 'fingerprint is required'],
    },
    message: {
      type: String,
      required: [true, 'message is required'],
    },
    stackSample: {
      type: String,
      required: [true, 'stackSample is required'],
    },
    status: {
      type: String,
      enum: ['open', 'resolved', 'ignored'],
      default: 'open',
    },
    statusHistory: {
      type: [statusHistoryEntrySchema],
      default: [],
    },
    aiSummary: {
      type: aiSummarySchema,
      default: null,
    },
    count: {
      type: Number,
      default: 1,
    },
    firstSeen: {
      type: Date,
      required: true,
      default: Date.now,
    },
    lastSeen: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    // No { timestamps: true } — firstSeen/lastSeen already cover that
    // role, but with dedup-specific semantics. See DECISIONS.md.
  }
);

// Compound unique index — the core of dedup. Task 9.3's atomic
// findOneAndUpdate(..., { upsert: true }) keyed on
// { projectId, fingerprint } relies on this to guarantee no two
// documents for the same bug in the same project can ever exist,
// even under concurrent writes at the same millisecond.
errorGroupSchema.index({ projectId: 1, fingerprint: 1 }, { unique: true });

module.exports = mongoose.model('ErrorGroup', errorGroupSchema);
```

Verified manually:
- Valid document passes `validateSync()` cleanly (returns `undefined` —
  Mongoose only returns an `Error` object when validation actually
  fails)
- Missing `projectId`/`message`/`stackSample` correctly rejected
- Invalid `status` enum value correctly rejected
- Defaults confirmed: `status: 'open'`, `count: 1`,
  `statusHistory: []`, `aiSummary: null`

Compound unique index on `{ projectId, fingerprint }` is declared but
not yet exercised against live Atlas — that happens in Task 9.3 once
the upsert logic exists to actually trigger a duplicate-key scenario.

### ErrorEvent (`server/models/ErrorEvent.js`)
```javascript
const errorEventSchema = new mongoose.Schema({
  errorGroupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ErrorGroup',
    required: [true, 'errorGroupId is required'],
    index: true,
  },
  rawStack: {
    type: String,
    required: [true, 'rawStack is required'],
  },
  env: {
    type: String,
    default: null,
    trim: true,
    maxlength: 50,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
    // No validation beyond "is an object" — raw client metadata
    // shouldn't be pre-validated to the point where it can't be stored.
    // Future enrichment pipelines can normalize or filter if/when
    // a concrete schema emerges for "useful metadata".
  },
  receivedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

// Index for timeline queries: recent events first.
// Included with ErrorGroup's compound index in the same find/sort-once
// pattern that powers the Dashboard's Error Detail View.
errorEventSchema.index({ errorGroupId: 1, receivedAt: -1 });

module.exports = mongoose.model('ErrorEvent', errorEventSchema);

```
Verified manually (`validateSync()`): valid doc clean, missing
`errorGroupId` rejected, missing `rawStack` rejected, defaults
(`env: null`, `metadata: {}`, real `receivedAt`) all correct.

## Planned Collections (not yet implemented)

**Note (Task 7):** `POST /api/events` exists as a skeleton — it
validates and acknowledges (`202`) but does not write to either
collection below yet. Don't assume events are being persisted just
because the endpoint exists; persistence starts at Task 9.

```



`ErrorGroup` (9.1) and `ErrorEvent` (9.2) both landed with real schema
 code. Only Task 9.3's upsert wiring remains before Task 9 closes.
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