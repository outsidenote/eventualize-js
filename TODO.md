# TODO — follow-ups

Small cleanups noticed during the pnpm migration (Aug 2026) and the dependency update (Oct 2026), left out of those PRs on purpose.

- **Delete `setup-dynamodb.ts`** at the repo root — it points at an old schema
  path and the wrong port (8000 vs LocalStack's 4566), and only exists as dead code.
- **Fix or remove `generate:stream-factory`** — the script points at a file
  that doesn't exist on main.
- **Run prettier** on the 27 files it currently complains about.
- **TypeScript 7**: blocked until typescript-eslint supports it (8.72.1 accepts
  `typescript <6.1.0`). Then move root, apps and the eslint plugin together.
- **Demo app majors** (`apps/e2e/funds`, `apps/e2e/funds/catalog`,
  `apps/playground/frontend`): React 19, Vite 8 (now on 6.4 for a security fix),
  `@vitejs/plugin-react` 6, Express 5, mongodb 7, http-proxy-middleware 4,
  `@asyncapi/react-component` 3, `@types/swagger-ui-react` 5. They need code changes.
- **OpenTelemetry SDK 3 and `@opentelemetry/api` 1.10**: move together. SDK 2.x
  peers accept only `@opentelemetry/api <1.10.0`, and SDK 3.x accepts only
  `>=1.10.0 <1.11.0`, so the workspace pins `@opentelemetry/api` to `~1.9.1`.
  The published peer range (`^1.7.0`) already allows 1.10. npm marks
  `@opentelemetry/sdk-trace-base` and `@opentelemetry/sdk-trace-node` as
  deprecated ("Use @opentelemetry/sdk-trace package"); replace them in the
  same move (`packages/core` and `apps/sample-app` tests).
- **`@types/node` 26**: move when CI moves to Node 26. Keep one `@types/node`
  major across the workspace.
