# TODO — follow-ups

Small cleanups noticed during the pnpm migration (Aug 2026), left out of that PR on purpose.

- **Regenerate the Prisma client** with a current Prisma version, and align the
  `prisma` CLI (still 6.x) with `@prisma/client` (7.x). Then remove the version
  pins in `pnpm-workspace.yaml`.
- **Delete `setup-dynamodb.ts`** at the repo root — it points at an old schema
  path and the wrong port (8000 vs LocalStack's 4566), and only exists as dead code.
- **Fix or remove `generate:stream-factory`** — the script points at a file
  that doesn't exist on main.
- **Run prettier** on the 27 files it currently complains about.
- **eslint-plugin version drift**: it pins eslint 9 / typescript 5 while the
  root uses eslint 10 / typescript 6 — align them.
- **README fixes**: DynamoDB port in the env table says 8000; compose uses 4566.
