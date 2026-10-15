# Contributing

Thanks for helping. This page shows how to set up the repo, run the checks, and
send a pull request.

## Setup

You need:

- Node.js 24 (the version CI uses)
- pnpm 10 (`corepack enable` picks the version in `package.json`)
- Docker, for the integration tests

```bash
git clone https://github.com/outsidenote/eventualize-js.git
cd eventualize-js
pnpm install
pnpm build
```

Use pnpm only. npm and yarn are blocked.

Build before you run tests or apps: workspace packages resolve from `dist/`.

## Repo layout

| Path | What |
|------|------|
| `packages/` | Published `@eventualize/*` packages |
| `apps/` | Private sample, demo and test apps |
| `docs/` | User docs ([index](docs/README.md)) |
| `docs/adr/` | Architecture decision records |

## Run the checks

```bash
pnpm build
pnpm lint            # eslint + prettier; pnpm lint:fix to fix
pnpm test:unit       # no database
pnpm test            # all tests; starts databases with Testcontainers
```

Test one database: `pnpm test:postgres`, `pnpm test:mysql` or
`pnpm test:dynamodb`.

To use long-running local databases instead of Testcontainers:

```bash
docker compose up -d               # Postgres 5432, MySQL 3306, LocalStack (DynamoDB) 4566
pnpm test:integration:bare
pnpm stop-local-dbs
```

Connection strings are in `.env.test`.

## Write code

- Follow the conventions in [AGENTS.md](AGENTS.md#conventions). They apply to
  humans too.
- Put tests next to the code: `Name.test.ts`. Use `node:test`.
- Code that changes the database (adapters) needs a test in
  `apps/sample-app/src/tests/integration.test.ts`, so it runs on all databases.
- For a design choice others will ask about, add an ADR in `docs/adr/`.

## Update the docs

Update the docs in the same pull request as the code. The table in
[AGENTS.md → Docs to update](AGENTS.md#docs-to-update) says which file.

## Add a changeset

Every change to a published package needs a changeset:

```bash
pnpm changeset
```

Pick the packages and the bump (patch, minor, major), and write one line for
the changelog. Commit the new file in `.changeset/`.

## Send a pull request

1. Branch from `main`.
2. Make sure build, lint and tests pass.
3. Open the pull request and fill in the template.

CI runs the build, unit tests and integration tests for each database.

## Releases

Maintainers release with [Changesets](https://github.com/changesets/changesets).
After a merge to `main`, a bot opens a "chore: version packages" pull request.
Merging it publishes to npm.

## Upgrading Prisma

The Prisma packages are pinned to one exact version, because the checked-in
generated client works only with the runtime that generated it. Change all pins
together, then run `pnpm exec prisma generate` in
`packages/adapters/postgres-storage-adapter` and
`packages/adapters/mysql-storage-adapter`.
