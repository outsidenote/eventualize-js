# @eventualize/core

The core of [eventualize-js](https://github.com/outsidenote/eventualize-js):
type-safe event-sourced streams, views, snapshots, outbox messages, replay, clone
and OpenTelemetry tracing.

## Install

```bash
pnpm add @eventualize/core @eventualize/types @opentelemetry/api
```

You also need a storage adapter: PostgreSQL, MySQL or DynamoDB. See
[Storage adapters](https://github.com/outsidenote/eventualize-js/blob/main/docs/guides/storage-adapters.md).

## Usage

```ts
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";

type PointsAdded = { readonly points: number };

const PointsStreamFactory = new StreamFactoryBuilder("PointsStream")
  .withEvent("PointsAdded")
  .asType<PointsAdded>()
  .withView("Sum", { sum: 0 }, {
    PointsAdded: (state, event) => ({ sum: state.sum + event.points }),
  })
  .build();

const stream = await PointsStreamFactory.get("user-1", storage, storage);
await stream.appendEventPointsAdded({ points: 50 });
await stream.store();
stream.views.Sum.sum; // 50
```

To choose which OpenTelemetry spans the factory's streams produce, add
`.withTelemetry()` before `.build()`. Spans you do not list keep their default.
See the [OpenTelemetry guide](https://github.com/outsidenote/eventualize-js/blob/main/docs/guides/opentelemetry.md#choose-which-spans-to-produce).

```ts
  .withTelemetry({ spans: { "eventualize.stream.append": true, "eventualize.adapter.*": true } })
  .build();
```

## Main modules

Import each module by its path. There is no root index.

| Import path | Exports |
|-------------|---------|
| `@eventualize/core/factories/StreamFactoryBuilder` | `StreamFactoryBuilder` |
| `@eventualize/core/factories/EvDbStreamFactory` | `EvDbStreamFactory`, `StreamWithEventMethods` |
| `@eventualize/core/factories/EvDbCloneTypes` | `EvDbCloneOptions` |
| `@eventualize/core/store/EvDbCloneError` | `EvDbCloneError` (default) |
| `@eventualize/core/adapters/IEvDbStorageAdapter` | `IEvDbStorageAdapter` |
| `@eventualize/core/otel` | `withSpan`, `startScopedSpan`, `eventualizeInstrumentation`, `EVDB_TRACER_NAMES`, tracer getters, `EVDB_DEFAULT_SPANS`, `EvDbTelemetryOptions` and the other span-filter types |

## Docs

- [Getting started](https://github.com/outsidenote/eventualize-js/blob/main/docs/getting-started.md)
- [Concepts](https://github.com/outsidenote/eventualize-js/blob/main/docs/concepts.md)
- [Replay: `goToOffset`](https://github.com/outsidenote/eventualize-js/blob/main/docs/guides/replay.md)
- [Clone: `clone`](https://github.com/outsidenote/eventualize-js/blob/main/docs/guides/clone.md)
- [OpenTelemetry](https://github.com/outsidenote/eventualize-js/blob/main/docs/guides/opentelemetry.md)

## License

MIT
