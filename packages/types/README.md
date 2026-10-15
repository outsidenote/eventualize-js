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
| `@eventualize/types/adapters/IEvDbStorageSnapshotAdapter` | Interface: read and store view snapshots |
| `@eventualize/types/store/IEvDbReadOnlyStream` | The stream returned by `goToOffset` |

## Docs

- [Concepts](https://github.com/outsidenote/eventualize-js/blob/main/docs/concepts.md)
- [Writing a storage adapter](https://github.com/outsidenote/eventualize-js/blob/main/docs/guides/storage-adapters.md#writing-a-new-adapter)

## License

MIT
