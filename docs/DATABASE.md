# Faultline — Database Design

**Status: no models implemented yet.** This file will be filled in as
each Mongoose model is created (Task 2 onward). Documenting the
*planned* schema here now so intent is clear before implementation.

## Planned Collections

```
User {
  _id, name, email (unique), passwordHash, createdAt
}

Project {
  _id, ownerId (ref User), name, apiKeyHash, githubRepo (optional, validated
  as "owner/repo"), createdAt
}

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

Populated with real Mongoose schema code once Task 2 (User model) and
subsequent model tasks land.