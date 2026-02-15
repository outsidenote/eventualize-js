# Storage Adapters Refactoring v1

This document describes the refactoring changes applied to the storage adapter packages under `packages/adapters/`.

---

## 1. Fix `isOccException` operator precedence bug

**File:** [`packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts`](../../../packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts) (line 242)

**What changed:**
```ts
// Before (broken):
return !!error && anyError?.code === 'P2002' || anyError.code === 'P2034';

// After (fixed):
return !!error && (anyError?.code === 'P2002' || anyError?.code === 'P2034');
```

**Why:** JavaScript operator precedence causes `&&` to bind tighter than `||`. The original expression evaluated as `(!!error && anyError?.code === 'P2002') || anyError.code === 'P2034'`, meaning the `P2034` check ran unconditionally — even when `error` was `null`/`undefined`, which would throw a runtime error. Added parentheses to group the `||` correctly, and added optional chaining (`?.`) to the second check for safety.

---

## 2. Fix `StreamStoreAffected` wrong argument type

**File:** [`packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts`](../../../packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts) (lines 107-110)

**What changed:**
```ts
// Before (wrong type):
const numMessages = queryResult[1].count;
return new StreamStoreAffected(numEvents, numMessages);

// After (correct Map<string, number>):
const numMessages = messagesToInsert
    .reduce((prev, { message_type: t }) =>
        Object.assign(prev, { [t]: (prev[t] ?? 0) + 1 }), {} as Record<string, number>);
return new StreamStoreAffected(numEvents, new Map(Object.entries(numMessages)));
```

**Why:** `StreamStoreAffected` expects `numMessages` to be a `ReadonlyMap<string, number>` (a map of message type to count), but the Prisma adapter was passing a plain `number` from `createMany().count`. This bug was hidden because the constructor accepted `any`. The fix groups messages by `message_type` into a `Map`, matching the DynamoDB adapter's existing behavior.

---

## 3. Remove pointless catch-rethrow blocks

**Files:**
- [`packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts`](../../../packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts) — methods: `getLastOffsetAsync`, `getEventsAsync`, `getMessagesAsync`, `getSnapshotAsync`, `storeSnapshotAsync`
- [`packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapter.ts`](../../../packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapter.ts) — methods: `getSnapshotAsync`, `storeSnapshotAsync`

**What changed:** Removed `try { ... } catch (error) { throw error; }` wrappers that did nothing.

**Why:** A catch block that only re-throws the same error adds noise, extra indentation, and zero value. Exceptions propagate automatically. The meaningful `try/catch` in `storeStreamAsync` (which checks for OCC violations) was kept.

---

## 4. Remove unused `serializePayload` function

**Files:**
- [`packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts`](../../../packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts)
- [`packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapter.ts`](../../../packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapter.ts)

**What changed:** Removed `const serializePayload = (payload) => Buffer.from(JSON.stringify(payload), 'utf-8');` from both files.

**Why:** This function was defined but never called in either adapter. Dead code increases cognitive load and suggests a code path that doesn't exist.

---

## 5. Remove commented-out import

**File:** [`packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts`](../../../packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts)

**What changed:** Removed `// import { eventsCreateManyInput } from './generated/prisma/models';`

**Why:** Commented-out code is noise. If it's needed later, it lives in version control history.

---

## 6. Remove debug `listTables()` call and function

**Files:**
- [`packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapter.ts`](../../../packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapter.ts) — removed `await listTables(this.dynamoDbClient);` from `storeStreamAsync` and removed the `listTables` import
- [`packages/adapters/dynamodb-storage-adapter/src/DynamoDbClient.ts`](../../../packages/adapters/dynamodb-storage-adapter/src/DynamoDbClient.ts) — removed the `listTables` export function and its `ListTablesCommand` import

**Why:** `listTables()` was a debugging aid that logged table names to console on every `storeStreamAsync` call. It was no longer imported anywhere after the adapter cleanup, so the function itself was also removed.

---

## 7. Remove `console.log` statements from DynamoDB admin

**File:** [`packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbAdmin.ts`](../../../packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbAdmin.ts) (previously `EvDBDynamoDBAdmin.ts`)

**What changed:** Removed two `console.log` lines from `clearTableItems`:
- `console.log(\`Deleted ${items.length} items from ${tableName}.\`)`
- `console.log(\`Finished item deletion for table: ${tableName}\`)`

**Why:** Library code should not log to console. Consumers can add their own logging/observability. These were leftover debug statements.

---

## 8. Remove duplicated unused interfaces

**Files:**
- [`packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts`](../../../packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts)
- [`packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapter.ts`](../../../packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapter.ts)

**What changed:** Removed four interfaces that were identically copy-pasted in both files:
- `EvDbEventRecord`
- `EvDbSnapshotRecord`
- `IEvDbOutboxTransformer`
- `EvDbStorageContext`

Also removed the now-unused `IEvDbEventMetadata` import from both files, and the `IEvDbPayloadData` import from the DynamoDB adapter.

**Why:** These interfaces were exported but never imported by any consumer. The DynamoDB adapter uses its own `EventRecord` class (from the queries file), and the Prisma adapter uses Prisma-generated types directly. Duplicate, unused types create confusion about which is canonical.

---

## 9. Fix stale JSDoc on DynamoDB adapter class

**File:** [`packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapter.ts`](../../../packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapter.ts) (line 22-24)

**What changed:**
```ts
// Before:
/** Prisma-based storage adapter for EvDb
 *  Replaces SQL Server-specific adapter with database-agnostic Prisma implementation */

// After:
/** DynamoDB storage adapter for EvDb */
```

**Why:** The JSDoc was copied from the Prisma adapter and never updated. It incorrectly described the DynamoDB adapter as "Prisma-based".

---

## 10. Fix stale `repository.directory` in package.json files

**Files:**
- [`packages/adapters/relational-storage-adapter/package.json`](../../../packages/adapters/relational-storage-adapter/package.json)
- [`packages/adapters/postgres-storage-adapter/package.json`](../../../packages/adapters/postgres-storage-adapter/package.json)
- [`packages/adapters/mysql-storage-adapter/package.json`](../../../packages/adapters/mysql-storage-adapter/package.json)
- [`packages/adapters/dynamodb-storage-adapter/package.json`](../../../packages/adapters/dynamodb-storage-adapter/package.json)

**What changed:** Updated `repository.directory` from `packages/<name>` to `packages/adapters/<name>` in all four adapter packages.

**Why:** The adapters were recently moved into `packages/adapters/` (commit `625ff55`) but the `repository.directory` fields were not updated, making npm registry links point to non-existent paths.

---

## 11. Rename `EvDBDynamoDBAdmin.ts` for consistent file casing

**Files:**
- [`packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbAdmin.ts`](../../../packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbAdmin.ts) — renamed from `EvDBDynamoDBAdmin.ts`
- [`apps/sample-app/src/tests/steps.ts`](../../../apps/sample-app/src/tests/steps.ts) — updated import path

**What changed:**
```ts
// Before:
import EvDbDynamoDbAdmin from '@eventualize/dynamodb-storage-adapter/EvDBDynamoDBAdmin';

// After:
import EvDbDynamoDbAdmin from '@eventualize/dynamodb-storage-adapter/EvDbDynamoDbAdmin';
```

**Why:** Every other file in the project uses `EvDb` PascalCase (e.g., `EvDbDynamoDbStorageAdapter.ts`, `EvDbPrismaStorageAdapter.ts`). The all-caps `EvDBDynamoDB` was inconsistent and could cause issues on case-sensitive file systems.

---

## 12. Add missing `@eventualize/types` dependency

**Files:**
- [`packages/adapters/relational-storage-adapter/package.json`](../../../packages/adapters/relational-storage-adapter/package.json)
- [`packages/adapters/dynamodb-storage-adapter/package.json`](../../../packages/adapters/dynamodb-storage-adapter/package.json)

**What changed:** Added `"@eventualize/types": "^2.0.0"` to `dependencies`.

**Why:** Both packages import heavily from `@eventualize/types` but did not declare it as a dependency. This works in the monorepo (hoisted `node_modules`) but would break for external consumers installing the package from npm, since the dependency would not be resolved.

---

## 13. Document intentional `any` usage in Prisma constructors

**Files:**
- [`packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts`](../../../packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts) (line 35)
- [`packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdmin.ts`](../../../packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdmin.ts) (line 5)

**What changed:** Added eslint-disable comment explaining the `any` type:
```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Each DB adapter generates its own PrismaClient type; accepting `any` allows interoperability.
constructor(private readonly prisma: any) {
```

**Why:** Each database adapter (Postgres, MySQL) generates its own structurally incompatible `PrismaClient` type via Prisma codegen. Using `PrismaClient` from the relational adapter's own generated code causes type errors when consumers pass in a Postgres or MySQL client. The `any` is intentional and now documented.

---

## Verification

All changes were verified by running `npm run build` (TypeScript compilation) from the repository root with zero errors.
