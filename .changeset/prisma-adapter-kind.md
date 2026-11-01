---
"@eventualize/relational-storage-adapter": minor
---

Add an optional `kind` option to `EvDbPrismaStorageAdapter` (`"postgres"`, `"mysql"` or `"relational"`). The adapter reports it as the `eventualize.adapter.kind` attribute on its OpenTelemetry spans. When you omit it, the value stays `"relational"`.
