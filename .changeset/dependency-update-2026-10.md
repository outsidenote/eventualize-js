---
"@eventualize/types": minor
"@eventualize/core": minor
"@eventualize/relational-storage-adapter": minor
"@eventualize/postgres-storage-adapter": minor
"@eventualize/mysql-storage-adapter": minor
"@eventualize/dynamodb-storage-adapter": minor
---

Dependency update (October 2026).

- The optional `@opentelemetry/api` peer range is now `>=1.7.0` (was `^1.7.0`), so newer API versions do not cause install conflicts.
- Internal `@eventualize/*` dependencies now use `^` ranges, so your app and our packages can share one copy of a newer 6.x release.
- Prisma is pinned to `7.10.0`, and the generated Prisma clients were regenerated with that version. Prisma stays a regular dependency, so your app can use a different Prisma version.
