# Faultline — Database Design

**Status: `User` (Task 2), `Project` (Task 5.1, `apiKeyHash` now
unique-indexed as of the Task 1-14 audit), `ErrorGroup` (Task 9.1,
`aiSummary` fully populated as of Task 14), and `ErrorEvent` (Task
9.2) models implemented. Atomic-upsert dedup (Task 9.3) and AI
enrichment (Tasks 13/14) are both wired and live-verified.**

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
    unique: true,     // added in the Task 1-14 audit — was missing an index/uniqueness constraint despite apiKeyMiddleware's hot-path lookup assuming one existed
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
    firstSeenRelease: {
      type: String,
      trim: true,
      default: null,
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
**exercised against live Atlas as of Task 9.3** — confirmed via a
real duplicate-fingerprint POST sequence: first call inserts (`count:
1`), second call updates the same document in place (`count: 2`),
no second document created. A distinct fingerprint correctly produced
a separate `ErrorGroup`.


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
  release: {
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

### SourceMap (`server/models/SourceMap.js`)
```javascript
const sourceMapSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.Mixed,
    required: [true, 'projectId is required'],
    index: true,
  },
  filename: {
    type: String,
    required: [true, 'filename is required'],
    trim: true,
  },
  release: {
    type: String,
    trim: true,
    default: null,
  },
  map: {
    type: mongoose.Schema.Types.Mixed,
    required: [true, 'map is required'],
  },
  uploadedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

sourceMapSchema.index({ projectId: 1, release: 1, filename: 1 }, { unique: true });
```
Verified via unit tests (`server/tests/sourceMapService.test.js`).

### Deployment (`server/models/Deployment.js`) — Task 40

```javascript
const deploymentSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: [true, 'projectId is required'],
    index: true,
  },
  sha: {
    type: String,
    required: [true, 'sha is required'],
    trim: true,
  },
  ref: {
    type: String,
    trim: true,
    default: null,
  },
  deployedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  source: {
    type: String,
    enum: ['github-webhook', 'manual'],
    required: true,
  },
  // Populated once by the delayed deployment-correlation job (Task
  // 40.3/40.4) — never recomputed on read. status stays 'pending'
  // (all other fields null) until the after-window has elapsed.
  correlation: {
    status: { type: String, enum: ['pending', 'computed'], default: 'pending' },
    windowMinutes: { type: Number, default: null },
    beforeCount: { type: Number, default: null },
    afterCount: { type: Number, default: null },
    beforeRate: { type: Number, default: null },   // events/minute
    afterRate: { type: Number, default: null },    // events/minute
    regressionSuspected: { type: Boolean, default: false },
    computedAt: { type: Date, default: null },
  },
}, { timestamps: { createdAt: true, updatedAt: false } });

deploymentSchema.index({ projectId: 1, deployedAt: -1 });
```
Verified via unit tests (`server/tests/deploymentCorrelationService.test.js`,
the pure before/after math) and a live manual test against a real
webhook POST + real ingested events + a real MongoDB Atlas connection
(see `TASKS.md`'s Task 40.6 entry for the full trace, including the
one deliberate shortcut taken: the correlation job's real ~15-minute
BullMQ delay was not waited out live — `deploymentService.correlateDeployment`
was invoked directly against the same real data instead, to verify
the query/math/persistence without spending 15 minutes of session
time on a delay mechanism BullMQ itself already guarantees).

### Incident (`server/models/Incident.js`) — Task 41

```javascript
const incidentSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: [true, 'projectId is required'],
    index: true,
  },
  title: { type: String, required: [true, 'title is required'], trim: true },
  status: {
    type: String,
    enum: ['open', 'investigating', 'resolved'],
    default: 'open',
  },
  // Derived from affectedGroups' aiSummary.severity (the highest
  // among them) whenever a group is added — not asked of the LLM.
  // Null until at least one affected group has a severity to derive
  // from.
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: null,
  },
  // The ORIGINATING trigger only — later dedup-appended triggers are
  // recorded in `timeline`, not here.
  triggeredBy: {
    type: { type: String, enum: ['deployment', 'spike', 'manual'], required: true },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  affectedGroups: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ErrorGroup' }],
    default: [],
  },
  timeline: {
    type: [{
      type: {
        type: String,
        enum: ['created', 'deployment_regression', 'spike_detected', 'status_changed', 'ai_diagnosis', 'note'],
        required: true,
      },
      message: { type: String, required: true },
      timestamp: { type: Date, required: true, default: Date.now },
    }],
    default: [],
  },
  // One-paragraph hypothesis text — a plain string, not ErrorGroup.
  // aiSummary's structured { rootCause, severity, suggestedFix }
  // shape, since an incident's diagnosis answers a different question
  // ("what connects these events") than a single group's enrichment
  // does. Null until the delayed diagnosis job completes.
  aiSummary: { type: String, default: null },
}, { timestamps: { createdAt: true, updatedAt: true } });

incidentSchema.index({ projectId: 1, status: 1, createdAt: -1 });
```
Verified via unit tests (`server/tests/incidentService.test.js`, 10
cases covering dedup-create-vs-append, the open-status-only dedup
filter, severity derivation, and both ownership-check paths) and a
live manual test against a real webhook-triggered deployment
regression, real ingested events, a real MongoDB Atlas connection, and
two real browser tabs confirming SSE push (see `TASKS.md`'s Task 41.6
entry for the full trace, including the one disclosed gap: the real
Gemini API's free-tier daily quota was already exhausted from earlier
load-testing sessions, so the AI-diagnosis job's actual network call
could only be verified as failing correctly — real 429, real
retry/backoff, real terminal failure leaving `aiSummary` null — not as
succeeding; the prompt-building and validation logic around that call
are covered separately by `server/tests/aiService.test.js`'s unit
tests, which need no network access).

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