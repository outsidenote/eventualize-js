# ADR 0004 — Peer dependency ranges stop at the next major

**Status:** Accepted
**Date:** 2026-11-01

## Context

The October 2026 dependency update opened the peer ranges of the published
packages with `>=` floors: `@opentelemetry/api >=1.7.0`,
`@aws-sdk/client-dynamodb >=3.1111.0` and `eslint >=9.0.0`. The goal was that
consumers can install newer versions without install conflicts.

A `>=` range also accepts majors that we never tested. A consumer on
`@opentelemetry/api` 2, `@aws-sdk/client-dynamodb` 4 or ESLint 11 would get no
warning, even if our code breaks with it.

## Decision

- **Peer ranges allow every newer minor and patch of the current major, and
  stop at the next major.** We use a caret range from the tested floor:
  - `@opentelemetry/api`: `^1.7.0` (types, core, relational, dynamodb)
  - `@aws-sdk/client-dynamodb`: `^3.1111.0` (dynamodb)
  - `eslint`: `^9.0.0 || ^10.0.0` (eslint-plugin)
- **A new major is added on purpose.** When a new major ships, we test it and
  add it to the range with `||`, as the `eslint` range does.
- **Regular dependencies keep caret ranges** (`@aws-sdk/util-dynamodb`,
  `@typescript-eslint/utils`, `@eventualize/*` through `workspace:^`), so a
  consumer's newer minor or patch dedupes into one copy.
- **Prisma stays pinned exactly.** The checked-in generated client must match
  its runtime version (see the October 2026 dependency update design).

## Consequences

- Consumers can move to any newer minor or patch of a peer with no conflict.
- A consumer on an untested major gets a peer warning (an error with
  `--strict-peer-deps`) until we add that major.
- Each new peer major needs a small release of the affected packages.
- No peer that exists today is excluded: the newest versions on 2026-11-01 are
  `@opentelemetry/api` 1.10.0, `@aws-sdk/client-dynamodb` 3.1161.0 and
  `eslint` 10.14.0.
