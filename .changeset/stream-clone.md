---
"@eventualize/types": minor
"@eventualize/core": minor
---

Stream replay, part 2: `factory.clone(...)`.

- New `factory.clone(streamId, targetStreamId, streamStorageAdapter, snapshotStorageAdapter?, options?)` copies a stream (up to `offsetLimit`) into a new, empty stream of the same type. `projectEvent` can change or drop events and override `capturedAt`/`capturedBy`; `projectMessage` can change or drop produced outbox messages. By default events are copied as is and no messages are produced. Writes are stored per page and batched to stay under 100 items (events + messages) per store, which is the DynamoDB transaction limit.
- New `EvDbCloneError` reports how far a failed clone got.
- New `EvDbMessage.withChannel(channel)`.
- `IEvDbStreamFactory` gains a required `clone` member. This affects custom implementations of the interface.
