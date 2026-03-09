# EvDb Project — Claude Instructions

## Quality Gate

Before starting any task and after completing any task, run the following checks and ensure none are broken or degraded:

```sh
pnpm build
pnpm test
pnpm lint
```

Fix any failures before proceeding or marking a task complete.

