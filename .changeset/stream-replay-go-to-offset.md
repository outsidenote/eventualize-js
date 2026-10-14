---
"@eventualize/types": minor
"@eventualize/core": minor
"@eventualize/relational-storage-adapter": minor
"@eventualize/dynamodb-storage-adapter": minor
---

Stream replay, part 1: positioning on a stored event and walking forward.

- New `factory.goToOffset(...)` returns a read-only, forward-only `IEvDbReadOnlyStream` with `event`, `views`, `messages`, `isHead` and `forward`.
- `getEventsAsync(cursor, pageSize?)` and `getSnapshotAsync(viewAddress, maxOffset?)` gained optional parameters. Relational and DynamoDB paging bugs are fixed: duplicate or missing events across pages, and a DynamoDB infinite loop past one page.
- BEHAVIOR CHANGE: relational `getEventsAsync` now yields the stored payload as-is. Before, it wrapped the payload as `{ eventType, payload }`. It now matches DynamoDB and what `store` writes. This also fixes `factory.get()` folding events after a snapshot.
- `IEvDbStreamFactory` gains a required `goToOffset` member. This affects custom implementations of the interface.
