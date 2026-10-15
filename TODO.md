# TODO — follow-ups

Small cleanups noticed during the pnpm migration (Aug 2026) and the dependency update (Oct 2026), left out of those PRs on purpose.

- **Delete `setup-dynamodb.ts`** at the repo root — it points at an old schema
  path and the wrong port (8000 vs LocalStack's 4566), and only exists as dead code.
- **Fix or remove `generate:stream-factory`** — the script points at a file
  that doesn't exist on main.
- **Run prettier** on the 27 files it currently complains about.
- **TypeScript 7**: blocked until typescript-eslint supports it (8.71.2 accepts
  `typescript <6.1.0`). Then move root, apps and the eslint plugin together.
- **Demo app majors** (`apps/e2e/funds`, `apps/e2e/funds/catalog`): React 19,
  Vite 8, `@vitejs/plugin-react` 6, Express 5, mongodb 7, http-proxy-middleware 4,
  `@asyncapi/react-component` 3, `@types/swagger-ui-react` 5. They need code changes.
- **`@types/node` 26**: move when CI moves to Node 26. Keep one `@types/node`
  major across the workspace.
