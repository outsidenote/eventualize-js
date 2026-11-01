# AGENTS.md

Instructions for coding agents working in this repo. Humans: start at
[README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

eventualize-js (EvDb) is a TypeScript event-sourcing library. It is a pnpm
monorepo: published packages live in `packages/`, private demo and test apps
live in `apps/`.

## Commands

Run every command from the repo root. Use `pnpm` only (a preinstall guard
blocks npm and yarn).

```bash
pnpm install
pnpm build                 # tsc --build; run before tests and before running any app
pnpm lint                  # eslint + prettier --check
pnpm lint:fix
pnpm test:unit             # fast, no database
pnpm test                  # everything; starts Postgres, MySQL, LocalStack via Testcontainers (needs Docker)
pnpm test:postgres         # one database: test:postgres | test:mysql | test:dynamodb
```

Run one test file:

```bash
node --import tsx --test packages/core/src/store/EvDbStream.applyEvent.test.ts
# integration test file: add the env and containers
TEST_CONTAINER=true pnpm exec dotenv -e .env.test -- node --import tsx --test apps/sample-app/src/tests/integration.test.ts
```

## Health check before and after each change

Record a baseline before you edit, and compare after every change:

```bash
pnpm build 2>&1 | grep "error TS" | wc -l
pnpm exec eslint . 2>&1 | grep -c " error "
```

Neither count may go up. A lint fix must keep the build count, and a build fix
must keep the lint count. If a count goes up, revert and try another way.

## Done means

- `pnpm build` and `pnpm exec eslint .` are clean (see counts above).
- The tests for the code you touched pass. Run `pnpm test` for changes in
  `packages/`.
- A changeset exists for any change to a published package: `pnpm changeset`.
- Docs match the code. See [Docs to update](#docs-to-update).

## Layout

| Path | What |
|------|------|
| `packages/types` | Shared interfaces (`IEvDb*`). No runtime logic. |
| `packages/core` | Streams, views, messages, `StreamFactoryBuilder`, replay, clone, OTel. |
| `packages/adapters/relational-storage-adapter` | Prisma-based base adapter for SQL. Holds the generated Prisma client. |
| `packages/adapters/{postgres,mysql}-storage-adapter` | SQL adapters. Each has `prisma/schema.prisma`. |
| `packages/adapters/dynamodb-storage-adapter` | DynamoDB adapter. |
| `packages/eslint-plugin` | Rule `enforce-stream-factory-module`. |
| `apps/sample-app` | Sample streams (`PointsStream`, `FundsStream`) **and** the integration test harness (`src/tests/`). |
| `apps/otel-sample-app`, `apps/e2e/funds`, `apps/playground` | Demos. |
| `docs/` | User docs. Index: [docs/README.md](docs/README.md). |
| `docs/superpowers/`, `spec/` | Working plans and specs. Historical; they may be stale. |

## Conventions

- ESM with `NodeNext` resolution: relative imports end in `.js`, also in `.ts` files.
- Use `import type` for type-only imports (lint error otherwise).
- Unused names start with `_`.
- File names: classes and interfaces use PascalCase with an `EvDb` prefix
  (`EvDbStream.ts`, `IEvDbStorageAdapter.ts`); helper functions use camelCase
  (`withSpan.ts`).
- Tests sit next to the code: `Name.test.ts` or `Name.<feature>.test.ts`, using
  `node:test` (`describe`/`test`) with Given/When/Then names. Test helpers end in
  `.test-support.ts`.
- Packages have no `index.ts` barrel. Consumers deep-import through the
  `exports` wildcard, e.g. `@eventualize/core/factories/StreamFactoryBuilder`.
- A stream factory module holds only imports, one
  `const XFactory = new StreamFactoryBuilder(...)...build()`, `export default XFactory`,
  and an optional `export type XStreamType = typeof XFactory.StreamType`. The
  ESLint rule enforces this. Example:
  `apps/sample-app/src/eventstore/PointsStream/PointsStreamFactory.ts`.
- View handlers are pure: return a new state object.

## Gotchas

- Workspace packages resolve from `dist/`. After you change a package, run
  `pnpm build` before you run an app or a test in another package.
- `**/generated/` is the checked-in Prisma client. Regenerate it; do not edit it.
- Prisma packages are pinned to one exact version, because the generated client
  only works with the runtime that generated it. To upgrade, change all pins
  together, then run `prisma generate` in `postgres-storage-adapter` and
  `mysql-storage-adapter`.
- Internal `@eventualize/*` dependencies use `workspace:^`.
- Local DynamoDB is LocalStack on port **4566**. Any `8000` you see is stale.
- Streams made with `factory.create()` start at offset **1**.
- `.js`, `.d.ts`, `.js.map` files inside `src/` are stray emit, not sources.
  Edit the `.ts` file.
- CI (`.github/workflows/ci.yml`) runs build, unit and per-database integration
  tests on Node 24. It does not run lint, so run it yourself.

## Docs to update

| You changed | Update |
|-------------|--------|
| Public API of a package | That package's `README.md`, and the guide in `docs/guides/` that covers it |
| Replay (`goToOffset`, `forward`) | [docs/guides/replay.md](docs/guides/replay.md) |
| Clone (`clone`) | [docs/guides/clone.md](docs/guides/clone.md) |
| View snapshot strategy (`withView` snapshot callback) | [docs/guides/snapshots.md](docs/guides/snapshots.md) |
| Outbox table or message fields | [docs/guides/outbox.md](docs/guides/outbox.md) |
| OTel spans or attributes | [docs/guides/opentelemetry.md](docs/guides/opentelemetry.md) |
| Adapter interface or schema | [docs/guides/storage-adapters.md](docs/guides/storage-adapters.md) |
| Commands, layout, conventions | This file |
| A doc file added or moved | [docs/README.md](docs/README.md) and [llms.txt](llms.txt) |

Record a design decision as a new ADR in `docs/adr/`.
