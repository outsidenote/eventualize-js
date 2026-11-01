---
"@eventualize/types": patch
"@eventualize/core": patch
"@eventualize/eslint-plugin": patch
"@eventualize/relational-storage-adapter": patch
"@eventualize/postgres-storage-adapter": patch
"@eventualize/mysql-storage-adapter": patch
"@eventualize/dynamodb-storage-adapter": patch
---

Update dependencies and cap peer ranges at the current major.

- **Security:** Prisma moves to 7.10.1. `@prisma/adapter-mariadb` 7.10.1 uses `mariadb` 3.5.4, which fixes high-severity SQL injection, credential leak and memory exposure issues in `mariadb` 3.4.5. Users of `@eventualize/mysql-storage-adapter` should update.
- Peer ranges now allow every newer minor and patch, but not the next major: `@opentelemetry/api` `^1.7.0`, `@aws-sdk/client-dynamodb` `^3.1111.0`, `eslint` `^9.0.0 || ^10.0.0`. No released version is excluded. See ADR 0004.
- `@typescript-eslint/utils` moves to `^8.72.1`.
