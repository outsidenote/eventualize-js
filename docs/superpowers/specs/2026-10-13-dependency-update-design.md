# Dependency Update and Consumer-Friendly Ranges — Design

**Status:** Approved design, pending spec review
**Date:** 2026-10-13
**Branch:** `dependencies-update-2026-10-13`

---

## Goal

Update every dependency in the workspace to its newest **stable** version, within the scope below. Declare the dependencies of the published `@eventualize/*` packages so that consumers can install newer versions of shared libraries without install conflicts.

## Success criteria

1. No pre-release versions anywhere. Pick the highest stable version, even when the npm `latest` tag points at a pre-release (for example, `prisma` `latest` is `8.0.0-rc.22`; the target is `7.10.0`).
2. No collisions between the new versions. A fresh `pnpm install` with `strict-peer-dependencies=true` passes, and each shared library resolves to one version.
3. Consumers can install newer versions of shared libraries without conflicts. A packed-tarball install into a fresh npm project with `--strict-peer-deps` passes.
4. Build and lint error counts are not higher than the baseline (rule from `CLAUDE.md`).
5. The full test suite is green, including the Postgres, MySQL and DynamoDB integration tests.

## Scope

| Area | Policy |
| --- | --- |
| Published packages (`packages/*`, `packages/adapters/*`) | Latest stable, including new majors |
| Root tooling (`package.json` at the root) | Latest stable, including new majors |
| `apps/sample-app` (integration test host) | Latest stable, including new majors |
| Demo apps (`apps/e2e/funds`, `apps/e2e/funds/catalog`, `apps/otel-sample-app`) | Same major only. New majors go to `TODO.md` |

Version caps that come from other packages:

- **TypeScript stays on 6.0.x.** `typescript-eslint` 8.71.2 (latest) accepts only `typescript >=4.8.4 <6.1.0`. TypeScript 7 goes to `TODO.md`.
- **`@types/node` stays on `^24`.** CI runs Node 24. Types for Node 26 would allow APIs that CI does not have. One major in the build graph also avoids type clashes between projects.

OpenTelemetry `0.x` packages in the demo apps move from `0.218` to `0.223`. In semver a `0.x` minor can break, but these packages are released together, so they move as one set.

## Dependency policy for published packages

The rule: a library that passes objects across the boundary between the consumer and our code is a **peer** with an open `>=floor` range. A library that is internal, or tied to generated code, is a regular **dependency**. Regular dependencies never cause install conflicts; at worst the consumer gets a second, nested copy.

| Dependency | Package | Kind | Range |
| --- | --- | --- | --- |
| `@opentelemetry/api` | types, core, relational, dynamodb | optional peer (already) | `^1.7.0` → `>=1.7.0` |
| `@aws-sdk/client-dynamodb` | dynamodb | dependency → **peer** (+ devDependency for local builds) | `>=3.1111.0` |
| `@aws-sdk/util-dynamodb` | dynamodb | dependency | `^3.996.9` |
| `eslint` | eslint-plugin | peer | `>=9.0.0` (unchanged) |
| `@typescript-eslint/utils` | eslint-plugin | devDependency → **dependency** | `^8.71.2` |
| `@prisma/client`, `@prisma/adapter-pg`, `@prisma/adapter-mariadb`, `prisma` | relational, postgres, mysql, types | dependency / devDependency, **exact pin** | `7.10.0` |
| `@eventualize/*` | all | dependency | `workspace:*` → `workspace:^` |

Reasons:

- **`@opentelemetry/api`** uses a global singleton. Two copies break trace context, so it must be a peer.
- **`@aws-sdk/client-dynamodb`**: `EvDbDynamoDbStorageAdapter` accepts a `DynamoDBClient` from the consumer. Two copies cause TypeScript errors on private members. The floor `3.1111.0` comes from the peer range of `@aws-sdk/util-dynamodb`.
- **`@typescript-eslint/utils`**: `enforce-stream-factory-module.ts` imports it at runtime, but it was only a devDependency. Consumers got "module not found". This is a bug fix.
- **Prisma**: the generated client imports `@prisma/client/runtime/client`, and the runtime must match the generator version. A wide peer range would let a consumer's Prisma version break our generated client, so we pin it exactly. `@prisma/client` marks its `prisma` and `typescript` peers as optional, so consumers do not get the Prisma CLI installed.
- **`workspace:^`** publishes as `^6.0.0` instead of `6.0.0`. A consumer who installs a newer `@eventualize/types` 6.x then gets one shared copy instead of two.

### Limits we cannot remove

- `@typescript-eslint/utils` accepts only `typescript <6.1.0` and `eslint` up to 10. Consumers of `@eventualize/eslint-plugin` on TypeScript 7 or ESLint 11 will see a peer warning from typescript-eslint, not from us.
- `@aws-sdk/util-dynamodb` limits `@aws-sdk/client-dynamodb` to `^3`. No v4 is announced.

## Target versions

Only changed entries are listed. `^` ranges unless shown as exact.

| Dependency | From | To | Where |
| --- | --- | --- | --- |
| `@asyncapi/react-component` | `^2.4.0` | `^2.6.5` | e2e-funds-catalog |
| `@aws-sdk/client-dynamodb` | `^3.948.0` | `^3.1150.0` | sample-app, root, dynamodb-storage-adapter (peer `>=3.1111.0`) |
| `@aws-sdk/util-dynamodb` | `^3.948.0` | `^3.996.9` | dynamodb-storage-adapter |
| `@changesets/cli` | `^2.29.8` | `^3.0.3` | root |
| `@opentelemetry/api` | `^1.9.0` | `^1.9.1` | e2e-funds, otel-sample-app |
| `@opentelemetry/api-logs` | `^0.218.0` | `^0.223.0` | e2e-funds, otel-sample-app |
| `@opentelemetry/auto-instrumentations-node` | `^0.76.0` | `^0.81.0` | e2e-funds, otel-sample-app |
| `@opentelemetry/exporter-logs-otlp-proto` | `^0.218.0` | `^0.223.0` | e2e-funds, otel-sample-app |
| `@opentelemetry/exporter-metrics-otlp-proto` | `^0.218.0` | `^0.223.0` | e2e-funds, otel-sample-app |
| `@opentelemetry/exporter-trace-otlp-http` | `^0.218.0` | `^0.223.0` | e2e-funds |
| `@opentelemetry/exporter-trace-otlp-proto` | `^0.218.0` | `^0.223.0` | e2e-funds, otel-sample-app |
| `@opentelemetry/sdk-logs` | `^0.218.0` | `^0.223.0` | e2e-funds, otel-sample-app |
| `@opentelemetry/sdk-metrics` | `^2.7.1` | `^2.12.0` | e2e-funds, otel-sample-app |
| `@opentelemetry/sdk-node` | `^0.218.0` | `^0.223.0` | e2e-funds, otel-sample-app |
| `@opentelemetry/sdk-trace-base` | `^1.30.1` | `^2.12.0` | core |
| `@opentelemetry/sdk-trace-node` | `^1.30.1` | `^2.12.0` | sample-app, core |
| `@prisma/adapter-mariadb` | `^7.1.0` | `7.10.0` | mysql-storage-adapter |
| `@prisma/adapter-pg` | `~7.3.0`, `^7.1.0` | `7.10.0` | e2e-funds, sample-app, postgres-storage-adapter |
| `@prisma/client` | `^7.1.0` | `7.10.0` | sample-app, mysql, postgres, relational, types |
| `@testcontainers/localstack` | `^11.11.0` | `^12.2.0` | sample-app |
| `@testcontainers/mysql` | `^11.11.0` | `^12.2.0` | sample-app |
| `@testcontainers/postgresql` | `^11.11.0` | `^12.2.0` | sample-app |
| `@types/express` | `^5.0.0` | `^5.0.6` | e2e-funds-catalog, e2e-funds |
| `@types/node` | `^24.0.0`, `^24.10.1` | `^24.19.2` | catalog, e2e-funds, otel-sample-app, root, dynamodb-storage-adapter |
| `@types/pg` | `^8.18.0`, `^8.16.0` | `^8.23.1` | e2e-funds, otel-sample-app, sample-app |
| `@types/react` | `^18.3.10` | `^18.3.31` | e2e-funds-catalog |
| `@types/react-dom` | `^18.3.0` | `^18.3.7` | e2e-funds-catalog |
| `@types/swagger-ui-react` | `^4.18.3` | `^4.19.0` | e2e-funds-catalog |
| `@typescript-eslint/parser` | `^8.0.0` | `^8.71.2` | eslint-plugin |
| `@typescript-eslint/utils` | `^8.0.0` | `^8.71.2` | eslint-plugin (moves to `dependencies`) |
| `@vitejs/plugin-react` | `^4.3.1` | `^4.7.0` | e2e-funds-catalog |
| `dotenv` | `^17.2.3` | `^18.0.7` | sample-app, mysql, postgres, relational, types |
| `eslint` | `^10.0.0`, `^9.0.0` | `^10.12.0` | root, eslint-plugin (devDependency) |
| `express` | `^4.21.0` | `^4.22.3` | e2e-funds-catalog, e2e-funds |
| `http-proxy-middleware` | `^3.0.3` | `^3.0.7` | e2e-funds-catalog |
| `mongodb` | `^6.0.0` | `^6.21.0` | e2e-funds |
| `mysql2` | `^3.15.3` | `^3.24.5` | sample-app |
| `pg` | `^8.0.0`, `^8.18.0` | `^8.23.1` | e2e-funds, otel-sample-app, sample-app |
| `pg-boss` | `^12.14.0` | `^12.37.1` | e2e-funds |
| `prisma` | `^6.19.2`, `^7.8.0`, `^6.12.0` | `7.10.0` | mysql, postgres, relational, types |
| `swagger-ui-react` | `^5.17.14` | `^5.33.2` | e2e-funds-catalog |
| `testcontainers` | `^11.11.0` | `^12.2.0` | sample-app |
| `tsx` | `^4.21.0`, `^4.0.0` | `^4.23.15` | catalog, e2e-funds, otel-sample-app, root, eslint-plugin |
| `typescript` | `^6.0.2`, `^5.0.0` | `^6.0.3` | catalog, e2e-funds, otel-sample-app, root, eslint-plugin |
| `typescript-eslint` | `^8.56.0` | `^8.71.2` | root |
| `vite` | `^5.4.8` | `^5.4.21` | e2e-funds-catalog |

### Pre-check result (2026-10-13)

The target set was checked on a scratch copy of all manifests, with the full policy applied:

- Peer ranges of every target version against the other target versions: 0 issues.
- Fresh `pnpm install --lockfile-only` with `strict-peer-dependencies=true`: passed, no peer warnings.
- One version each of `@opentelemetry/api` (1.9.1), all `@prisma/*` and `prisma` (7.10.0), `@aws-sdk/client-dynamodb` (3.1150.0), `typescript` (6.0.3), `eslint` (10.12.0), `@typescript-eslint/utils` (8.71.2).
- `@types/node`: 24.19.2, plus 18.x from `testcontainers → @types/ssh2` (test-only, not in the build graph). The current lockfile has three copies (12, 18, 24).

## Implementation steps

### Step 0 — Baseline

Before any edit, record:

- `pnpm build 2>&1 | grep "error TS" | wc -l`
- `pnpm exec eslint . 2>&1 | grep -c " error "`
- the result of `pnpm test` (unit and integration).

Before treating a test failure as a code bug, rule out the environment: Docker daemon running, `.env.test` present, ports free.

### Step 1 — Manifests

1. Apply the target versions and the dependency policy to every `package.json`.
2. Delete `pnpm-lock.yaml` and run `pnpm install`. A fresh lockfile also moves transitive dependencies to their newest allowed versions, and it matches the state that the pre-check validated.
3. Repeat the collision check on the real repo: strict peer resolve, and `pnpm why` for each shared library.

### Step 2 — Prisma client

1. Run `prisma generate` with 7.10.0 for:
   - the relational client (the postgres schema writes to `relational-storage-adapter/src/generated/prisma`);
   - the mysql client (`mysql-storage-adapter/src/generated/prisma`).
2. If `env()` in `prisma.config.ts` needs connection variables, set dummy values for the generate run.
3. Delete `packages/adapters/postgres-storage-adapter/src/generated`. No code imports it, and it holds a stale 7.8.0 client.
4. The schemas do not change, so there are no new migrations.

### Step 3 — Code changes for major upgrades

Make minimal changes only.

- **OpenTelemetry `sdk-trace` v2** removes `addSpanProcessor()`. Change the test setup to `new NodeTracerProvider({ spanProcessors: [...] })` in:
  - `packages/core/src/otel/otel.test.ts`
  - `packages/core/src/otel/otel_flow.test.ts`
  - `packages/core/src/factories/EvDbStreamFactory.clone.test.ts`
  - `apps/sample-app/src/tests/integration.test.ts`

  Only the setup changes. Assertions do not change.
- **eslint-plugin** on ESLint 10 and TypeScript 6: fix the build or tests if they break.
- **testcontainers 12, dotenv 18, changesets 3**: fix if they break.

**Fallback rule:** if a major upgrade needs more than a mechanical change, keep that dependency at the latest version of its current major, add a `TODO.md` entry, and report it.

### Step 4 — Changesets

| Package | Bump | Reason |
| --- | --- | --- |
| `@eventualize/dynamodb-storage-adapter` | major | New required peer `@aws-sdk/client-dynamodb` |
| `@eventualize/eslint-plugin` | patch | Missing runtime dependency fixed |
| `@eventualize/types`, `core`, `relational-storage-adapter`, `postgres-storage-adapter`, `mysql-storage-adapter` | minor | Wider peer ranges, Prisma 7.10.0, `workspace:^` |

### Step 5 — Documentation

- `TODO.md`:
  - remove "Regenerate the Prisma client" and "eslint-plugin version drift";
  - add TypeScript 7 (blocked by typescript-eslint);
  - add demo-app majors: React 19, Vite 8, `@vitejs/plugin-react` 6, Express 5, mongodb 7, http-proxy-middleware 4, `@asyncapi/react-component` 3, `@types/swagger-ui-react` 5;
  - add `@types/node` 26, for when CI moves to Node 26.
- `CLAUDE.md`: remove the line that says Prisma is pinned in `pnpm-workspace.yaml`. Those pins no longer exist; the exact pins now live in the package manifests.
- `packages/README.md`: add a short "Peer dependencies" section for consumers (`@aws-sdk/client-dynamodb` required for the DynamoDB adapter, `@opentelemetry/api` optional, `eslint` for the ESLint plugin).

## Verification

All items must pass, with output shown:

1. Build and lint error counts are not higher than the Step 0 baseline.
2. `pnpm test` is green, including Postgres, MySQL and DynamoDB containers.
3. Collision check on the real repo: fresh strict resolve passes, and `pnpm why` shows one version of each shared library.
4. **Consumer smoke test**, in a scratch directory outside the repo:
   1. Run `pnpm pack` for every published package. This rewrites `workspace:^` to `^6.0.0`, as a real publish does.
   2. Create a fresh npm project.
   3. Run `npm install --strict-peer-deps` with all tarballs plus the latest stable `@opentelemetry/api`, `@aws-sdk/client-dynamodb`, `eslint` and `typescript@6`.
   4. Import every package entry point in Node ESM. This proves that the Prisma runtime loads with the generated client, and that the ESLint plugin finds `@typescript-eslint/utils`.

## Out of scope

- Major upgrades in the demo apps (listed in Step 5).
- TypeScript 7.
- Pre-release versions of any package.
- The other `TODO.md` items (prettier cleanup, `setup-dynamodb.ts`, `generate:stream-factory`, README port fix).

## Execution notes

- Subagents run on Claude Sonnet (organization rule).
- No commits without explicit approval.
