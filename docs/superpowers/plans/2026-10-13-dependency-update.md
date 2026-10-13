# Dependency Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every workspace dependency to the validated stable target versions, and declare the published packages' dependencies so consumers can install newer versions of shared libraries without conflicts.

**Architecture:** One script applies the exact target versions and the dependency policy to all 12 `package.json` files. A fresh lockfile is resolved under strict peer rules. The Prisma clients are then regenerated with the pinned Prisma version. Small code changes follow for the major upgrades. A packed-tarball install into a fresh npm project proves the consumer view.

**Tech Stack:** pnpm 10 workspace, TypeScript 6 (`tsc --build`), Node test runner via `tsx`, Prisma 7 (`prisma-client` generator), OpenTelemetry JS, AWS SDK v3, ESLint 10 + typescript-eslint 8, changesets 3, testcontainers 12.

**Spec:** `docs/superpowers/specs/2026-10-13-dependency-update-design.md`

## Global Constraints

- Use only the versions listed in this plan (validated on 2026-10-13). Do not re-resolve `latest` at execution time. Never use a pre-release version.
- Exact pins: `@prisma/client`, `@prisma/adapter-pg`, `@prisma/adapter-mariadb` and `prisma` are `7.10.0` everywhere.
- `typescript` stays `^6.0.3` (typescript-eslint accepts `<6.1.0`). `@types/node` stays `^24.19.2`.
- Peers in published packages: `@opentelemetry/api` `>=1.7.0` (optional), `@aws-sdk/client-dynamodb` `>=3.1111.0` (dynamodb adapter), `eslint` `>=9.0.0` (eslint plugin, unchanged).
- Internal `@eventualize/*` dependencies use `workspace:^`.
- Package manager: `pnpm` only. Never `npm install` inside the repo. (npm is used only in the scratch consumer project in Task 4.)
- After every change, `pnpm build` error count and `pnpm exec eslint .` error count must not be higher than the Task 1 baseline (`CLAUDE.md`).
- Before treating a test failure as a code bug, rule out the environment: Docker daemon running, `.env.test` present, ports free, no other test run in parallel.
- **No commits.** The user must approve every commit. Leave all changes in the working tree. Subagents must not run `git commit`.
- Subagents run on Claude Sonnet (organization rule).
- New code must be type-safe: no `any`, no `as` casts, no `@ts-ignore`.
- Shell state does not persist between commands. Every command block below starts with the `SCRATCH=` line. `SCRATCH` is outside the repo; never write temporary files into the repo.

## Review Focus

1. **npm consumer with strict peers:** a consumer installs the packed packages with `npm --strict-peer-deps` next to the current stable `@opentelemetry/api`, `@aws-sdk/client-dynamodb`, `eslint` and `typescript@6`. Expected: install succeeds. Test: Task 4, Step 4.
2. **Prisma runtime matches generated client:** a consumer creates a Postgres and a MySQL Prisma client from the packed packages. Expected: no crash at construction (the old failure was `Cannot read properties of undefined (reading 'graph')`). Test: Task 4, Step 5.
3. **Consumer passes its own `DynamoDBClient`:** with `@aws-sdk/client-dynamodb` now a peer, `new EvDbDynamoDbStorageAdapter(new DynamoDBClient({}))` must type-check in the consumer's project. Test: Task 4, Step 6.
4. **ESLint plugin without our devDependencies:** a consumer loads `@eventualize/eslint-plugin` and it finds `@typescript-eslint/utils`. Test: Task 4, Step 5.
5. **Release pipeline on changesets 3:** `changeset status` reads the existing `.changeset/config.json` and reports the planned bumps. Test: Task 3, Step 2.

---

### Task 1: Baseline, manifests, lockfile and Prisma client

**Files:**

- Modify: all 12 tracked `package.json` files (root, `packages/types`, `packages/core`, `packages/eslint-plugin`, `packages/adapters/{relational,postgres,mysql,dynamodb}-storage-adapter`, `apps/sample-app`, `apps/otel-sample-app`, `apps/e2e/funds`, `apps/e2e/funds/catalog`)
- Modify (regenerated): `pnpm-lock.yaml`
- Modify (regenerated): `packages/adapters/relational-storage-adapter/src/generated/prisma/**`
- Modify (regenerated): `packages/adapters/mysql-storage-adapter/src/generated/prisma/**`
- Delete: `packages/adapters/postgres-storage-adapter/src/generated/` (stale 7.8.0 client; nothing imports it)
- Create (outside repo): `$SCRATCH/baseline.txt`, `$SCRATCH/apply-deps.mjs`

**Interfaces:**

- Consumes: nothing.
- Produces: `$SCRATCH/baseline.txt` with lines `build_errors=<n>`, `lint_errors=<n>`, `core_test_typecheck_errors=<n>`, `tests_pass=<n>`, `tests_fail=<n>`. Tasks 2–4 compare against these numbers. Generated Prisma clients with `"clientVersion": "7.10.0"`.

- [ ] **Step 1: Check the environment**

```bash
cd "/Users/bnaya/Documents/Repos/Open Sources/EvDb Family/eventualize-js"
SCRATCH="/private/tmp/claude-502/-Users-bnaya-Documents-Repos-Open-Sources-EvDb-Family-eventualize-js/02c57eaf-ddc8-49fd-bb14-a2f01df3b328/scratchpad/dep-update"
mkdir -p "$SCRATCH"
node -v                     # expected: v22.22+ or v24+ or v26+
docker info --format '{{.ServerVersion}}'   # expected: a version number, not an error
test -f .env.test && echo "env ok"          # expected: env ok
git status --short          # expected: only docs/superpowers/* changes
```

If Docker is not running, stop and ask the user to start it.

- [ ] **Step 2: Record the baseline**

```bash
cd "/Users/bnaya/Documents/Repos/Open Sources/EvDb Family/eventualize-js"
SCRATCH="/private/tmp/claude-502/-Users-bnaya-Documents-Repos-Open-Sources-EvDb-Family-eventualize-js/02c57eaf-ddc8-49fd-bb14-a2f01df3b328/scratchpad/dep-update"
{
  echo "build_errors=$(pnpm build 2>&1 | grep -c 'error TS')"
  echo "lint_errors=$(pnpm exec eslint . 2>&1 | grep -c ' error ')"
  echo "core_test_typecheck_errors=$(pnpm exec tsc -p packages/core/tsconfig.test.json --noEmit 2>&1 | grep -c 'error TS')"
} > "$SCRATCH/baseline.txt"
pnpm test > "$SCRATCH/baseline-tests.log" 2>&1; echo "exit=$?"
echo "tests_pass=$(grep -E '^# pass ' "$SCRATCH/baseline-tests.log" | awk '{s+=$3} END {print s+0}')" >> "$SCRATCH/baseline.txt"
echo "tests_fail=$(grep -E '^# fail ' "$SCRATCH/baseline-tests.log" | awk '{s+=$3} END {print s+0}')" >> "$SCRATCH/baseline.txt"
cat "$SCRATCH/baseline.txt"
```

Expected: five `key=value` lines. If `tests_fail` is not 0, list the failing test names from the log (`grep -E '^not ok' "$SCRATCH/baseline-tests.log"`) and report them. These are pre-existing failures, not caused by this work.

- [ ] **Step 3: Write the manifest script**

Create `$SCRATCH/apply-deps.mjs` with this exact content:

```js
// Applies the validated 2026-10-13 target versions and the dependency policy
// to every workspace package.json. Usage: node apply-deps.mjs <repoRoot>
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const repo = process.argv[2];

const TARGETS = {
  "@eventualize/core": {
    "@opentelemetry/api": "^1.9.1",
    "@opentelemetry/sdk-trace-base": "^2.12.0",
    "@opentelemetry/sdk-trace-node": "^2.12.0",
  },
  "@eventualize/dynamodb-storage-adapter": {
    "@aws-sdk/client-dynamodb": "^3.1150.0",
    "@aws-sdk/util-dynamodb": "^3.996.9",
    "@opentelemetry/api": "^1.9.1",
    "@types/node": "^24.19.2",
  },
  "@eventualize/eslint-plugin": {
    "@typescript-eslint/parser": "^8.71.2",
    "@typescript-eslint/utils": "^8.71.2",
    "eslint": "^10.12.0",
    "tsx": "^4.23.15",
    "typescript": "^6.0.3",
  },
  "@eventualize/mysql-storage-adapter": {
    "@prisma/adapter-mariadb": "7.10.0",
    "@prisma/client": "7.10.0",
    "dotenv": "^18.0.7",
    "prisma": "7.10.0",
  },
  "@eventualize/postgres-storage-adapter": {
    "@prisma/adapter-pg": "7.10.0",
    "@prisma/client": "7.10.0",
    "dotenv": "^18.0.7",
    "prisma": "7.10.0",
  },
  "@eventualize/relational-storage-adapter": {
    "@opentelemetry/api": "^1.9.1",
    "@prisma/client": "7.10.0",
    "dotenv": "^18.0.7",
    "prisma": "7.10.0",
  },
  "@eventualize/types": {
    "@opentelemetry/api": "^1.9.1",
    "@prisma/client": "7.10.0",
    "dotenv": "^18.0.7",
    "prisma": "7.10.0",
  },
  "e2e-funds": {
    "@opentelemetry/api": "^1.9.1",
    "@opentelemetry/api-logs": "^0.223.0",
    "@opentelemetry/auto-instrumentations-node": "^0.81.0",
    "@opentelemetry/exporter-logs-otlp-proto": "^0.223.0",
    "@opentelemetry/exporter-metrics-otlp-proto": "^0.223.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.223.0",
    "@opentelemetry/exporter-trace-otlp-proto": "^0.223.0",
    "@opentelemetry/sdk-logs": "^0.223.0",
    "@opentelemetry/sdk-metrics": "^2.12.0",
    "@opentelemetry/sdk-node": "^0.223.0",
    "@prisma/adapter-pg": "7.10.0",
    "@types/express": "^5.0.6",
    "@types/node": "^24.19.2",
    "@types/pg": "^8.23.1",
    "express": "^4.22.3",
    "kafkajs": "^2.2.4",
    "mongodb": "^6.21.0",
    "openapi-types": "^12.1.3",
    "pg": "^8.23.1",
    "pg-boss": "^12.37.1",
    "tsx": "^4.23.15",
    "typescript": "^6.0.3",
  },
  "e2e-funds-catalog": {
    "@asyncapi/react-component": "^2.6.5",
    "@types/express": "^5.0.6",
    "@types/node": "^24.19.2",
    "@types/react": "^18.3.31",
    "@types/react-dom": "^18.3.7",
    "@types/swagger-ui-react": "^4.19.0",
    "@vitejs/plugin-react": "^4.7.0",
    "express": "^4.22.3",
    "http-proxy-middleware": "^3.0.7",
    "openapi-types": "^12.1.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "swagger-ui-react": "^5.33.2",
    "tsx": "^4.23.15",
    "typescript": "^6.0.3",
    "vite": "^5.4.21",
  },
  "eventualize": {
    "@aws-sdk/client-dynamodb": "^3.1150.0",
    "@changesets/cli": "^3.0.3",
    "@eslint/js": "^10.0.1",
    "@types/node": "^24.19.2",
    "dotenv-cli": "^11.0.0",
    "eslint": "^10.12.0",
    "eslint-config-prettier": "^10.1.8",
    "prettier": "^3.9.10",
    "rimraf": "^6.1.3",
    "tsx": "^4.23.15",
    "typescript": "^6.0.3",
    "typescript-eslint": "^8.71.2",
  },
  "otel-sample-app": {
    "@opentelemetry/api": "^1.9.1",
    "@opentelemetry/api-logs": "^0.223.0",
    "@opentelemetry/auto-instrumentations-node": "^0.81.0",
    "@opentelemetry/exporter-logs-otlp-proto": "^0.223.0",
    "@opentelemetry/exporter-metrics-otlp-proto": "^0.223.0",
    "@opentelemetry/exporter-trace-otlp-proto": "^0.223.0",
    "@opentelemetry/sdk-logs": "^0.223.0",
    "@opentelemetry/sdk-metrics": "^2.12.0",
    "@opentelemetry/sdk-node": "^0.223.0",
    "@types/node": "^24.19.2",
    "@types/pg": "^8.23.1",
    "pg": "^8.23.1",
    "rimraf": "^6.1.3",
    "tsx": "^4.23.15",
    "typescript": "^6.0.3",
  },
  "sample-app": {
    "@aws-sdk/client-dynamodb": "^3.1150.0",
    "@opentelemetry/api": "^1.9.1",
    "@opentelemetry/sdk-trace-node": "^2.12.0",
    "@prisma/adapter-pg": "7.10.0",
    "@prisma/client": "7.10.0",
    "@testcontainers/localstack": "^12.2.0",
    "@testcontainers/mysql": "^12.2.0",
    "@testcontainers/postgresql": "^12.2.0",
    "@types/pg": "^8.23.1",
    "dotenv": "^18.0.7",
    "mysql2": "^3.24.5",
    "pg": "^8.23.1",
    "testcontainers": "^12.2.0",
  },
};

const OTEL_PEER_PACKAGES = new Set([
  "@eventualize/types",
  "@eventualize/core",
  "@eventualize/relational-storage-adapter",
  "@eventualize/dynamodb-storage-adapter",
]);

const files = execFileSync("git", ["-C", repo, "ls-files", "*package.json"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f !== "" && !f.includes("node_modules"));

const applied = new Set();
for (const f of files) {
  const file = path.join(repo, f);
  const pj = JSON.parse(readFileSync(file, "utf8"));
  const targets = TARGETS[pj.name] ?? {};

  // 1. Target versions (dependencies and devDependencies; peers are handled below).
  for (const section of ["dependencies", "devDependencies"]) {
    const deps = pj[section] ?? {};
    for (const [name, range] of Object.entries(targets)) {
      if (name in deps) {
        deps[name] = range;
        applied.add(`${pj.name}|${name}`);
      }
    }
    // 2. Internal packages publish as ^x.y.z instead of an exact version.
    for (const [name, range] of Object.entries(deps)) {
      if (range === "workspace:*") deps[name] = "workspace:^";
    }
  }

  // 3. Open peer range for the OpenTelemetry API singleton.
  if (OTEL_PEER_PACKAGES.has(pj.name)) {
    pj.peerDependencies["@opentelemetry/api"] = ">=1.7.0";
  }

  // 4. The consumer passes its own DynamoDBClient in, so the SDK client becomes a peer.
  if (pj.name === "@eventualize/dynamodb-storage-adapter") {
    const range = pj.dependencies["@aws-sdk/client-dynamodb"];
    delete pj.dependencies["@aws-sdk/client-dynamodb"];
    pj.peerDependencies["@aws-sdk/client-dynamodb"] = ">=3.1111.0";
    pj.devDependencies["@aws-sdk/client-dynamodb"] = range;
  }

  // 5. The rule imports @typescript-eslint/utils at runtime, so it must be a dependency.
  if (pj.name === "@eventualize/eslint-plugin") {
    const range = pj.devDependencies["@typescript-eslint/utils"];
    delete pj.devDependencies["@typescript-eslint/utils"];
    pj.dependencies = { "@typescript-eslint/utils": range };
  }

  writeFileSync(file, JSON.stringify(pj, null, 2) + "\n");
}

const missing = Object.entries(TARGETS).flatMap(([pkg, deps]) =>
  Object.keys(deps).filter((name) => !applied.has(`${pkg}|${name}`)).map((name) => `${pkg} -> ${name}`),
);
if (missing.length > 0) {
  console.error("Targets not applied:\n" + missing.join("\n"));
  process.exit(1);
}
console.log(`patched ${files.length} manifests, ${applied.size} targets applied`);
```

- [ ] **Step 4: Apply the script**

```bash
cd "/Users/bnaya/Documents/Repos/Open Sources/EvDb Family/eventualize-js"
SCRATCH="/private/tmp/claude-502/-Users-bnaya-Documents-Repos-Open-Sources-EvDb-Family-eventualize-js/02c57eaf-ddc8-49fd-bb14-a2f01df3b328/scratchpad/dep-update"
node "$SCRATCH/apply-deps.mjs" .
git diff --stat -- '*package.json'
```

Expected: `patched 12 manifests, 106 targets applied` (the number counts each package/dependency pair once). This output was dry-run on 2026-10-13 against a copy of the manifests: the result is byte-identical to the set that passed the collision check. `git diff --stat` lists 12 `package.json` files.

Spot-check the policy:

```bash
cd "/Users/bnaya/Documents/Repos/Open Sources/EvDb Family/eventualize-js"
node -e '
const r = (p) => require("./" + p + "/package.json");
const d = r("packages/adapters/dynamodb-storage-adapter");
console.log(d.peerDependencies, d.dependencies);
console.log(r("packages/eslint-plugin").dependencies);
console.log(r("packages/core").dependencies, r("packages/core").peerDependencies);
'
```

Expected:

- dynamodb peers: `{ "@opentelemetry/api": ">=1.7.0", "@aws-sdk/client-dynamodb": ">=3.1111.0" }`. Its dependencies no longer contain `@aws-sdk/client-dynamodb`.
- eslint-plugin dependencies: `{ "@typescript-eslint/utils": "^8.71.2" }`.
- core: `{ "@eventualize/types": "workspace:^" }` and `{ "@opentelemetry/api": ">=1.7.0" }`.

- [ ] **Step 5: Fresh lockfile under strict peer rules**

```bash
cd "/Users/bnaya/Documents/Repos/Open Sources/EvDb Family/eventualize-js"
SCRATCH="/private/tmp/claude-502/-Users-bnaya-Documents-Repos-Open-Sources-EvDb-Family-eventualize-js/02c57eaf-ddc8-49fd-bb14-a2f01df3b328/scratchpad/dep-update"
rm pnpm-lock.yaml
pnpm install --config.strict-peer-dependencies=true > "$SCRATCH/install.log" 2>&1; echo "exit=$?"
grep -vE '^Progress' "$SCRATCH/install.log"
```

Expected: `exit=0`, and no `Issues with peer dependencies found` block. The only warning allowed is the deprecated subdependencies line (`glob@10.5.0`, `node-domexception@1.0.0`).

- [ ] **Step 6: Check that each shared library has one version**

```bash
cd "/Users/bnaya/Documents/Repos/Open Sources/EvDb Family/eventualize-js"
for n in @opentelemetry/api @prisma/client @prisma/client-runtime-utils @prisma/driver-adapter-utils @prisma/adapter-pg @prisma/adapter-mariadb prisma @prisma/engines @aws-sdk/client-dynamodb typescript eslint @typescript-eslint/utils @types/node; do
  printf "%-32s %s\n" "$n" "$(grep -oE "^  '?${n}@[0-9][^(:']*" pnpm-lock.yaml | sed -E "s|^  '?${n}@||" | sort -uV | tr '\n' ' ')"
done
```

Expected (exact):

```text
@opentelemetry/api               1.9.1
@prisma/client                   7.10.0
@prisma/client-runtime-utils     7.10.0
@prisma/driver-adapter-utils     7.10.0
@prisma/adapter-pg               7.10.0
@prisma/adapter-mariadb          7.10.0
prisma                           7.10.0
@prisma/engines                  7.10.0
@aws-sdk/client-dynamodb         3.1150.0
typescript                       6.0.3
eslint                           10.12.0
@typescript-eslint/utils         8.71.2
@types/node                      18.19.130 24.19.2
```

`@types/node` 18.x is allowed. It comes from `testcontainers → @types/ssh2` and is not part of the build. Any other second version is a collision: stop and report it.

- [ ] **Step 7: Regenerate the Prisma clients**

```bash
cd "/Users/bnaya/Documents/Repos/Open Sources/EvDb Family/eventualize-js"
pnpm exec dotenv -e .env.test -- pnpm --filter @eventualize/postgres-storage-adapter exec prisma generate
pnpm exec dotenv -e .env.test -- pnpm --filter @eventualize/mysql-storage-adapter exec prisma generate
```

Expected: each command prints `Generated Prisma Client (7.10.0)`. The postgres schema writes to `../relational-storage-adapter/src/generated/prisma`. The mysql schema writes to `./src/generated/prisma`. `.env.test` supplies `POSTGRES_CONNECTION` and `MYSQL_CONNECTION`, which `prisma.config.ts` reads. `generate` does not connect to a database.

- [ ] **Step 8: Delete the stale postgres client and check versions**

```bash
cd "/Users/bnaya/Documents/Repos/Open Sources/EvDb Family/eventualize-js"
rm -rf packages/adapters/postgres-storage-adapter/src/generated
grep -h '"clientVersion"' packages/adapters/*/src/generated/prisma/internal/class.ts
grep -rn "generated" packages/adapters/postgres-storage-adapter/src || echo "no references"
```

Expected: two lines, both `"clientVersion": "7.10.0",`. Then `no references`.

- [ ] **Step 9: Build and lint against the baseline**

```bash
cd "/Users/bnaya/Documents/Repos/Open Sources/EvDb Family/eventualize-js"
SCRATCH="/private/tmp/claude-502/-Users-bnaya-Documents-Repos-Open-Sources-EvDb-Family-eventualize-js/02c57eaf-ddc8-49fd-bb14-a2f01df3b328/scratchpad/dep-update"
pnpm run cleanbuild > "$SCRATCH/task1-build.log" 2>&1
echo "build_errors=$(grep -c 'error TS' "$SCRATCH/task1-build.log")"
echo "lint_errors=$(pnpm exec eslint . 2>&1 | grep -c ' error ')"
grep -E 'build_errors|lint_errors' "$SCRATCH/baseline.txt"
```

Expected: both numbers are not higher than the baseline. `cleanbuild` removes old `dist/` output, including the deleted postgres `generated` folder. If the build count went up, read `$SCRATCH/task1-build.log`. Fix only what the upgrade broke, then re-run this step.

- [ ] **Step 10: Report (no commit)**

Report the outputs of Steps 4–9. Leave all changes uncommitted.

---

### Task 2: Code changes for the major upgrades

**Files:**

- Modify: `packages/core/src/otel/otel.test.ts:7-9`
- Modify: `packages/core/src/otel/otel_flow.test.ts:67-69`
- Possibly modify: `packages/eslint-plugin/src/**` (only if ESLint 10 breaks the build or tests)
- Possibly modify: `apps/sample-app/src/tests/TestContainerManager/**` (only if testcontainers 12 breaks container start)

**Interfaces:**

- Consumes: Task 1 installed dependencies and `$SCRATCH/baseline.txt`.
- Produces: green unit, plugin and integration tests on the new versions.

`packages/core/src/factories/EvDbStreamFactory.clone.test.ts:168` and `apps/sample-app/src/tests/integration.test.ts:35` use `new NodeTracerProvider()` and `register()` with no span processor. OpenTelemetry v2 still supports both, so they need no change.

- [ ] **Step 1: Run the OTel tests and see them fail**

```bash
cd "/Users/bnaya/Documents/Repos/Open Sources/EvDb Family/eventualize-js"
node --import tsx --test packages/core/src/otel/otel.test.ts packages/core/src/otel/otel_flow.test.ts 2>&1 | tail -20
```

Expected: FAIL with `TypeError: provider.addSpanProcessor is not a function`. OpenTelemetry SDK 2.x removed this method.

- [ ] **Step 2: Pass span processors to the constructor**

In `packages/core/src/otel/otel.test.ts`, replace:

```ts
const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
```

with:

```ts
const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
```

In `packages/core/src/otel/otel_flow.test.ts`, make the same replacement (same three lines, at lines 67–69). Do not change any assertion.

- [ ] **Step 3: Run the OTel tests and see them pass**

```bash
cd "/Users/bnaya/Documents/Repos/Open Sources/EvDb Family/eventualize-js"
node --import tsx --test packages/core/src/otel/otel.test.ts packages/core/src/otel/otel_flow.test.ts 2>&1 | grep -E '^# (pass|fail)'
```

Expected: `# fail 0`.

- [ ] **Step 4: Type-check the core tests**

```bash
cd "/Users/bnaya/Documents/Repos/Open Sources/EvDb Family/eventualize-js"
SCRATCH="/private/tmp/claude-502/-Users-bnaya-Documents-Repos-Open-Sources-EvDb-Family-eventualize-js/02c57eaf-ddc8-49fd-bb14-a2f01df3b328/scratchpad/dep-update"
echo "now=$(pnpm exec tsc -p packages/core/tsconfig.test.json --noEmit 2>&1 | grep -c 'error TS')"
grep core_test_typecheck_errors "$SCRATCH/baseline.txt"
```

Expected: `now` is not higher than the baseline.

- [ ] **Step 5: Run the ESLint plugin tests on ESLint 10**

```bash
cd "/Users/bnaya/Documents/Repos/Open Sources/EvDb Family/eventualize-js"
pnpm --filter @eventualize/eslint-plugin test 2>&1 | grep -E '^# (pass|fail)|Error'
```

Expected: `# fail 0`. If it fails, read the full output. Make the smallest change in `packages/eslint-plugin/src` that fixes it on ESLint 10. Do not change test expectations. If the fix needs more than a mechanical change, apply the fallback rule (Step 8).

- [ ] **Step 6: Run the full test suite**

```bash
cd "/Users/bnaya/Documents/Repos/Open Sources/EvDb Family/eventualize-js"
SCRATCH="/private/tmp/claude-502/-Users-bnaya-Documents-Repos-Open-Sources-EvDb-Family-eventualize-js/02c57eaf-ddc8-49fd-bb14-a2f01df3b328/scratchpad/dep-update"
pnpm test > "$SCRATCH/task2-tests.log" 2>&1; echo "exit=$?"
echo "pass=$(grep -E '^# pass ' "$SCRATCH/task2-tests.log" | awk '{s+=$3} END {print s+0}') fail=$(grep -E '^# fail ' "$SCRATCH/task2-tests.log" | awk '{s+=$3} END {print s+0}')"
grep -E 'tests_pass|tests_fail' "$SCRATCH/baseline.txt"
grep -E '^not ok' "$SCRATCH/task2-tests.log" || echo "no failures"
```

Expected: `exit=0`, `fail=0`, and `pass` not lower than `tests_pass`. This run uses testcontainers 12 for Postgres, MySQL and LocalStack.

If a container does not start, check the environment first (Docker running, ports free). testcontainers 12 changed the default wait strategy: it now uses the image's healthcheck when there is one. If that is the cause, add `.withWaitStrategy(Wait.forListeningPorts())` (import `Wait` from `testcontainers`) to the container that hangs in `apps/sample-app/src/tests/TestContainerManager/`. That restores the old behavior.

- [ ] **Step 7: Build and lint against the baseline**

```bash
cd "/Users/bnaya/Documents/Repos/Open Sources/EvDb Family/eventualize-js"
SCRATCH="/private/tmp/claude-502/-Users-bnaya-Documents-Repos-Open-Sources-EvDb-Family-eventualize-js/02c57eaf-ddc8-49fd-bb14-a2f01df3b328/scratchpad/dep-update"
echo "build_errors=$(pnpm build 2>&1 | grep -c 'error TS')"
echo "lint_errors=$(pnpm exec eslint . 2>&1 | grep -c ' error ')"
grep -E 'build_errors|lint_errors' "$SCRATCH/baseline.txt"
```

Expected: both numbers are not higher than the baseline.

- [ ] **Step 8: Fallback rule (only if a step above cannot pass with a mechanical change)**

For the dependency that blocks:

1. Set it back to the latest version of its current major. Use these versions, which are already validated: `@opentelemetry/sdk-trace-base`/`sdk-trace-node` `^1.30.1`; `testcontainers` and `@testcontainers/*` `^11.14.0`; `dotenv` `^17.4.2`; `@changesets/cli` `^2.31.1`; `eslint` (eslint-plugin devDependency) `^9.39.5`.
2. Run `pnpm install --config.strict-peer-dependencies=true` and repeat Task 1, Step 6.
3. Add a line to `TODO.md` (Task 3 edits this file) naming the dependency, the target major and the error.
4. Report it to the user.

- [ ] **Step 9: Report (no commit)**

Report the outputs of Steps 3–7. Leave all changes uncommitted.

---

### Task 3: Changesets and documentation

**Files:**

- Create: `.changeset/dynamodb-aws-sdk-peer.md`
- Create: `.changeset/eslint-plugin-runtime-dependency.md`
- Create: `.changeset/dependency-update-2026-10.md`
- Modify: `TODO.md`
- Modify: `CLAUDE.md:37-38`
- Modify: `packages/README.md` (new section after the "Packages" table)

**Interfaces:**

- Consumes: the final dependency versions from Tasks 1–2 (including any fallback from Task 2, Step 8).
- Produces: release notes for the next `changeset version`, and updated docs.

- [ ] **Step 1: Write the changesets**

`.changeset/dynamodb-aws-sdk-peer.md`:

```md
---
"@eventualize/dynamodb-storage-adapter": major
---

`@aws-sdk/client-dynamodb` is now a peer dependency (`>=3.1111.0`) instead of a regular dependency.

`EvDbDynamoDbStorageAdapter` accepts a `DynamoDBClient` that your app creates. As a peer, your app and the adapter now share one copy of the AWS SDK client, so the types always match. The range has no upper limit, so newer SDK versions do not cause install conflicts.

Migration: if your package manager does not install peers automatically, add the client to your app:

    pnpm add @aws-sdk/client-dynamodb
```

`.changeset/eslint-plugin-runtime-dependency.md`:

```md
---
"@eventualize/eslint-plugin": patch
---

Fix "Cannot find module '@typescript-eslint/utils'" when the plugin is installed in another project. The rule imports `@typescript-eslint/utils` at runtime, but it was declared as a devDependency. It is now a regular dependency.
```

`.changeset/dependency-update-2026-10.md`:

```md
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
```

- [ ] **Step 2: Check that changesets 3 reads the config and the changesets**

```bash
cd "/Users/bnaya/Documents/Repos/Open Sources/EvDb Family/eventualize-js"
pnpm changeset status --verbose 2>&1 | tail -40
```

Expected: no config error. The output lists `@eventualize/dynamodb-storage-adapter` under major, `@eventualize/types`, `core`, `relational-storage-adapter`, `postgres-storage-adapter` and `mysql-storage-adapter` under minor, and `@eventualize/eslint-plugin` under patch. The two existing changesets (`stream-clone.md`, `stream-replay-go-to-offset.md`) also appear; that is expected. Private apps are not listed.

- [ ] **Step 3: Update `TODO.md`**

Replace the whole file with:

```md
# TODO — follow-ups

Small cleanups noticed during the pnpm migration (Aug 2026) and the dependency update (Oct 2026), left out of those PRs on purpose.

- **Delete `setup-dynamodb.ts`** at the repo root — it points at an old schema
  path and the wrong port (8000 vs LocalStack's 4566), and only exists as dead code.
- **Fix or remove `generate:stream-factory`** — the script points at a file
  that doesn't exist on main.
- **Run prettier** on the 27 files it currently complains about.
- **README fixes**: DynamoDB port in the env table says 8000; compose uses 4566.
- **TypeScript 7**: blocked until typescript-eslint supports it (8.71.2 accepts
  `typescript <6.1.0`). Then move root, apps and the eslint plugin together.
- **Demo app majors** (`apps/e2e/funds`, `apps/e2e/funds/catalog`): React 19,
  Vite 8, `@vitejs/plugin-react` 6, Express 5, mongodb 7, http-proxy-middleware 4,
  `@asyncapi/react-component` 3, `@types/swagger-ui-react` 5. They need code changes.
- **`@types/node` 26**: move when CI moves to Node 26. Keep one `@types/node`
  major across the workspace.
```

If Task 2, Step 8 held back a dependency, add its line to this list too.

- [ ] **Step 4: Update `CLAUDE.md`**

Replace lines 37–38:

```md
- Prisma packages are pinned in `pnpm-workspace.yaml` (see the comment there)
  because the checked-in generated Prisma client only works with that version.
```

with:

```md
- Prisma packages (`@prisma/client`, `@prisma/adapter-pg`, `@prisma/adapter-mariadb`,
  `prisma`) are pinned to one exact version in the package manifests, because the
  checked-in generated Prisma client only works with the runtime version that
  generated it. To upgrade Prisma, change all pins together, then run
  `prisma generate` in `postgres-storage-adapter` and `mysql-storage-adapter`.
```

- [ ] **Step 5: Add a "Peer dependencies" section to `packages/README.md`**

Insert this section directly after the "Packages" table (before "## Replay: inspect a stream at a past offset"):

```md
## Peer dependencies

Install these in your app next to the `@eventualize/*` packages you use. The
ranges have no upper limit, so newer versions do not cause install conflicts.

| Peer | Range | Needed by | Required |
| --- | --- | --- | --- |
| `@aws-sdk/client-dynamodb` | `>=3.1111.0` | `@eventualize/dynamodb-storage-adapter` | Yes |
| `@opentelemetry/api` | `>=1.7.0` | `types`, `core`, `relational-storage-adapter`, `dynamodb-storage-adapter` | No, only for tracing |
| `eslint` | `>=9.0.0` | `@eventualize/eslint-plugin` | Yes |

Prisma is a regular dependency, pinned to the version that generated the
client in this repo. Your app can use a different Prisma version.

`@eventualize/eslint-plugin` depends on `@typescript-eslint/utils`, which
currently supports TypeScript below 6.1 and ESLint up to 10.
```

- [ ] **Step 6: Report (no commit)**

Report the output of Step 2 and the list of changed files. Leave all changes uncommitted.

---

### Task 4: Final verification and consumer smoke test

**Files:**

- No repo files change. Everything is created under `$SCRATCH/pack` and `$SCRATCH/consumer`.

**Interfaces:**

- Consumes: the finished working tree from Tasks 1–3 and `$SCRATCH/baseline.txt`.
- Produces: evidence for the Definition of Done.

- [ ] **Step 1: Clean rebuild, then build and lint against the baseline**

```bash
cd "/Users/bnaya/Documents/Repos/Open Sources/EvDb Family/eventualize-js"
SCRATCH="/private/tmp/claude-502/-Users-bnaya-Documents-Repos-Open-Sources-EvDb-Family-eventualize-js/02c57eaf-ddc8-49fd-bb14-a2f01df3b328/scratchpad/dep-update"
pnpm run rebuild > "$SCRATCH/final-build.log" 2>&1; echo "exit=$?"
echo "build_errors=$(grep -c 'error TS' "$SCRATCH/final-build.log")"
echo "lint_errors=$(pnpm exec eslint . 2>&1 | grep -c ' error ')"
cat "$SCRATCH/baseline.txt"
```

Expected: both numbers are not higher than the baseline. `rebuild` removes every `dist/`, so the tarballs in Step 3 hold no stale files.

- [ ] **Step 2: Full test suite**

```bash
cd "/Users/bnaya/Documents/Repos/Open Sources/EvDb Family/eventualize-js"
SCRATCH="/private/tmp/claude-502/-Users-bnaya-Documents-Repos-Open-Sources-EvDb-Family-eventualize-js/02c57eaf-ddc8-49fd-bb14-a2f01df3b328/scratchpad/dep-update"
pnpm test > "$SCRATCH/final-tests.log" 2>&1; echo "exit=$?"
echo "pass=$(grep -E '^# pass ' "$SCRATCH/final-tests.log" | awk '{s+=$3} END {print s+0}') fail=$(grep -E '^# fail ' "$SCRATCH/final-tests.log" | awk '{s+=$3} END {print s+0}')"
```

Expected: `exit=0`, `fail=0`, `pass` not lower than the baseline `tests_pass`.

- [ ] **Step 3: Pack the published packages**

```bash
cd "/Users/bnaya/Documents/Repos/Open Sources/EvDb Family/eventualize-js"
SCRATCH="/private/tmp/claude-502/-Users-bnaya-Documents-Repos-Open-Sources-EvDb-Family-eventualize-js/02c57eaf-ddc8-49fd-bb14-a2f01df3b328/scratchpad/dep-update"
rm -rf "$SCRATCH/pack" && mkdir -p "$SCRATCH/pack"
for d in packages/types packages/core packages/eslint-plugin packages/adapters/relational-storage-adapter packages/adapters/postgres-storage-adapter packages/adapters/mysql-storage-adapter packages/adapters/dynamodb-storage-adapter; do
  (cd "$d" && pnpm pack --pack-destination "$SCRATCH/pack" >/dev/null)
done
ls "$SCRATCH/pack"
tar -xOf "$SCRATCH/pack/eventualize-core-6.0.0.tgz" package/package.json | grep -E '"@eventualize/types"|"@opentelemetry/api"'
tar -tzf "$SCRATCH/pack/eventualize-postgres-storage-adapter-6.0.0.tgz" | grep -c generated || true
```

Expected:

- 7 `.tgz` files.
- In the packed core manifest: `"@eventualize/types": "^6.0.0"` (rewritten from `workspace:^`) and `"@opentelemetry/api": ">=1.7.0"`.
- `0` generated files in the postgres tarball.

- [ ] **Step 4: Install into a fresh npm project with strict peers**

```bash
SCRATCH="/private/tmp/claude-502/-Users-bnaya-Documents-Repos-Open-Sources-EvDb-Family-eventualize-js/02c57eaf-ddc8-49fd-bb14-a2f01df3b328/scratchpad/dep-update"
rm -rf "$SCRATCH/consumer" && mkdir -p "$SCRATCH/consumer" && cd "$SCRATCH/consumer"
npm init -y >/dev/null && npm pkg set type=module
npm install --strict-peer-deps --no-audit --no-fund \
  "$SCRATCH"/pack/*.tgz \
  @opentelemetry/api@1.9.1 @aws-sdk/client-dynamodb@3.1150.0 eslint@10.12.0 typescript@6.0.3 @types/node@24.19.2
echo "exit=$?"
grep -c '"resolved": "https://registry.npmjs.org/@eventualize' package-lock.json || true
```

Expected: `exit=0` with no `ERESOLVE` error. The last line prints `0`: every `@eventualize/*` package comes from the local tarballs, not from the registry.

- [ ] **Step 5: Load every package at runtime**

Create `$SCRATCH/consumer/smoke.mjs`:

```js
import assert from "node:assert";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import { withSpan } from "@eventualize/core/otel";
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import EvDbPrismaStorageAdapter from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import EvDbMySqlPrismaClientFactory from "@eventualize/mysql-storage-adapter/EvDbMySqlPrismaClientFactory";
import EvDbDynamoDbStorageAdapter from "@eventualize/dynamodb-storage-adapter/EvDbDynamoDbStorageAdapter";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import plugin from "@eventualize/eslint-plugin";

assert.equal(typeof EvDbEvent, "function");
assert.equal(typeof withSpan, "function");
assert.equal(typeof StreamFactoryBuilder, "function");

// Creating the clients loads the Prisma runtime with the generated client.
// No database is needed: Prisma connects on the first query.
const pg = EvDbPostgresPrismaClientFactory.create("postgresql://u:p@127.0.0.1:1/db");
const my = EvDbMySqlPrismaClientFactory.create("mariadb://u:p@127.0.0.1:1/db");
assert.ok(new EvDbPrismaStorageAdapter(pg));

assert.ok(new EvDbDynamoDbStorageAdapter(new DynamoDBClient({ region: "us-east-1" })));

assert.ok(Object.keys(plugin.rules).length > 0, "eslint plugin exposes rules");

await pg.$disconnect();
await my.$disconnect();
console.log("SMOKE OK");
```

Run it:

```bash
SCRATCH="/private/tmp/claude-502/-Users-bnaya-Documents-Repos-Open-Sources-EvDb-Family-eventualize-js/02c57eaf-ddc8-49fd-bb14-a2f01df3b328/scratchpad/dep-update"
cd "$SCRATCH/consumer" && node smoke.mjs; echo "exit=$?"
```

Expected: `SMOKE OK` and `exit=0`. A crash such as `Cannot read properties of undefined (reading 'graph')` means the Prisma runtime and the generated client do not match: go back to Task 1, Step 7.

- [ ] **Step 6: Type-check a consumer that passes its own clients in**

Create `$SCRATCH/consumer/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "files": ["check.ts"]
}
```

Create `$SCRATCH/consumer/check.ts`:

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import EvDbDynamoDbStorageAdapter from "@eventualize/dynamodb-storage-adapter/EvDbDynamoDbStorageAdapter";
import EvDbPrismaStorageAdapter from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";
import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";

// The consumer's own DynamoDBClient must be accepted: one shared copy through the peer.
export const dynamo: EvDbDynamoDbStorageAdapter = new EvDbDynamoDbStorageAdapter(
  new DynamoDBClient({ region: "us-east-1" }),
);

// The postgres factory's client must match the relational adapter's client type.
export const relational: EvDbPrismaStorageAdapter = new EvDbPrismaStorageAdapter(
  EvDbPostgresPrismaClientFactory.create("postgresql://u:p@127.0.0.1:1/db"),
);
```

Run it:

```bash
SCRATCH="/private/tmp/claude-502/-Users-bnaya-Documents-Repos-Open-Sources-EvDb-Family-eventualize-js/02c57eaf-ddc8-49fd-bb14-a2f01df3b328/scratchpad/dep-update"
cd "$SCRATCH/consumer" && npx tsc -p tsconfig.json; echo "exit=$?"
```

Expected: no output and `exit=0`.

- [ ] **Step 7: Final report (no commit)**

Report to the user:

- the baseline numbers and the final numbers (build errors, lint errors, test pass/fail);
- the outputs of Steps 3–6;
- any dependency held back by the fallback rule;
- `git status --short` of the repo.

Leave all changes uncommitted. Ask the user whether to commit, and with which message split.
