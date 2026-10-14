# @eventualize/eslint-plugin

## 6.1.1

### Highlights

- **Better OpenTelemetry support.** Events and outbox messages now store the W3C trace context (`traceparent` and `tracestate`) of the span that produced them, so you can link a stored event or message back to its trace. The context is captured from the active span when you do not pass it in.

  Database change: the relational adapters (MySQL and Postgres) replace the `telemetry_context` column with `traceparent` and `tracestate` (`VARCHAR(255)`) on the `events` and `outbox` tables. Apply the migration `20261011150000_replace_telemetry_context_with_traceparent` before you upgrade. The migration drops `telemetry_context` and its data.

- **Replay.** `factory.goToOffset(...)` opens a read-only stream at a stored event. Use `forward` to walk the stream ahead and read `event`, `views` and `messages` at each step.

- **Clone.** `factory.clone(...)` copies a stream into a new, empty stream of the same type. You can change or drop events and outbox messages during the copy.

### Patch Changes

- 9634936: Fix "Cannot find module '@typescript-eslint/utils'" when the plugin is installed in another project. The rule imports `@typescript-eslint/utils` at runtime, but it was declared as a devDependency. It is now a regular dependency.

## 6.0.0

### Major Changes

- 48ab5e4: refine api / remove payload type

## 5.0.0

### Major Changes

- e062a12: api changes, add withMessages and metadata

## 4.4.0

### Minor Changes

- a02ab9b: fix import of PrismaClient

## 4.3.0

### Minor Changes

- 302c66c: fix: update PrismaClient imports

## 4.2.0

### Minor Changes

- da41352: lint builder factory
