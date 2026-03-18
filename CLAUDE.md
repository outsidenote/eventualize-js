# EvDb Project — Claude Instructions

## Session Health Checks

### Before Making Any Changes

Always run these commands first and record the baseline counts:

```bash
pnpm build 2>&1 | grep "error TS" | wc -l   # baseline build error count
pnpm exec eslint . 2>&1 | grep -c " error "  # baseline lint error count
```

### After Every Change

Re-run and verify counts did not increase:

```bash
pnpm build 2>&1 | grep "error TS" | wc -l   # must not exceed baseline
pnpm exec eslint . 2>&1 | grep -c " error "  # must not exceed baseline
```

### Rules

- A lint fix must never increase the build error count
- A build fix must never increase the lint error count
- If either count increases vs baseline, revert the change and re-approach

## Warning: Symlink Fragility

The `@eventualize/*` symlinks in package-level and app-level `node_modules/` must point to
local workspace packages (e.g. `packages/types`), **not** the pnpm cache
(`node_modules/.pnpm/@eventualize+types@4.x.x/...`).

Running `pnpm install` will reset these. If the build breaks with type errors about
`separate declarations of a private property`, run:

```bash
BASE=$(pwd)
ln -sfn "$BASE/packages/types" "$BASE/apps/sample-app/node_modules/@eventualize/types"
ln -sfn "$BASE/packages/core" "$BASE/apps/sample-app/node_modules/@eventualize/core"
ln -sfn "$BASE/packages/adapters/relational-storage-adapter" "$BASE/apps/sample-app/node_modules/@eventualize/relational-storage-adapter"
ln -sfn "$BASE/packages/adapters/dynamodb-storage-adapter" "$BASE/apps/sample-app/node_modules/@eventualize/dynamodb-storage-adapter"
ln -sfn "$BASE/packages/adapters/mysql-storage-adapter" "$BASE/apps/sample-app/node_modules/@eventualize/mysql-storage-adapter"
ln -sfn "$BASE/packages/adapters/postgres-storage-adapter" "$BASE/apps/sample-app/node_modules/@eventualize/postgres-storage-adapter"
ln -sfn "$BASE/packages/types" "$BASE/packages/core/node_modules/@eventualize/types"
ln -sfn "$BASE/packages/types" "$BASE/packages/adapters/relational-storage-adapter/node_modules/@eventualize/types"
ln -sfn "$BASE/packages/types" "$BASE/packages/adapters/dynamodb-storage-adapter/node_modules/@eventualize/types"
```
