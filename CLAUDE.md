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

## Package Manager: pnpm only

This repo is a pnpm workspace (see `pnpm-workspace.yaml`). Always use `pnpm` —
never `npm install` or `yarn` (a preinstall guard blocks them).

- Install dependencies: `pnpm install`
- Internal `@eventualize/*` dependencies use `workspace:*`, so they always
  link to the local `packages/` folders automatically.
- Prisma packages are pinned in `pnpm-workspace.yaml` (see the comment there)
  because the checked-in generated Prisma client only works with that version.
