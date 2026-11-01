# @eventualize/types

Shared types and data classes for
[eventualize-js](https://github.com/outsidenote/eventualize-js): events,
outbox messages, stream cursors, snapshots, and the storage adapter interfaces.

Most apps get this package through `@eventualize/core`. Import it directly when
you build outbox messages or write a storage adapter.

## Install

```bash
pnpm add @eventualize/types @opentelemetry/api
```

## Main modules

Import each module by its path. Most modules have a default export.

| Import path | Use |
|-------------|-----|
| `@eventualize/types/messages/EvDbMessage` | Build outbox messages: `EvDbMessage.createFromMetadata(metadata, type, payload)` |
| `@eventualize/types/events/EvDbEvent` | A stored event with metadata |
| `@eventualize/types/stream/EvDbStreamAddress` | Stream type + stream id |
| `@eventualize/types/stream/EvDbStreamCursor` | Stream address + offset |
| `@eventualize/types/adapters/IEvDbStorageStreamAdapter` | Interface: read and store events and messages |
| `@eventualize/types/adapters/IEvDbStorageSnapshotAdapter` | Interface: read and store view snapshots (full rows and pointer rows) |
| `@eventualize/types/snapshots/EvDbSnapshotBody` | `EvDbSnapshotBody`: `{ kind: "full", state }` or `{ kind: "pointer", stateRef }` |
| `@eventualize/types/snapshots/EvDbStateRef` | `EvDbStateRef`: `{ kind: "row", offset }` or `{ kind: "default" }` |
| `@eventualize/types/view/DeepReadonly` | `DeepReadonly<T>`: the type of view state in handlers and on `view.state` |
| `@eventualize/types/store/IEvDbReadOnlyStream` | The stream returned by `goToOffset` |
| `@eventualize/types/telemetry/EvDbSpanPolicy` | Span filter types and `EVDB_DEFAULT_SPANS`. Adapter authors: `evDbTracerFor(spanName, tracer)` |

Adapter authors: `EvDbStoredSnapshotData` has a `body` (an `EvDbSnapshotBody`) instead of a
`state`. `EvDbStoredSnapshotResultRaw` and `EvDbStoredSnapshotResult` have a `stateRef`.

## Docs

- [Concepts](https://github.com/outsidenote/eventualize-js/blob/main/docs/concepts.md)
- [Immutable view state](https://github.com/outsidenote/eventualize-js/blob/main/docs/guides/immutable-state.md)
- [Writing a storage adapter](https://github.com/outsidenote/eventualize-js/blob/main/docs/guides/storage-adapters.md#writing-a-new-adapter)

## License

MIT
