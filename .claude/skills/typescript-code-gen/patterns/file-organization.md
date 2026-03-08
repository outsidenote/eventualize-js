# File Organization — Deep Dive

Reference file for [../SKILL.md](../SKILL.md).

## Table of Contents

1. [Directory Patterns](#1-directory-patterns)
2. [Naming Conventions](#2-naming-conventions)
3. [Git Strategy (Commit vs Ignore)](#3-git-strategy)
4. [The node_modules Anti-Pattern (Prisma Lesson)](#4-the-node_modules-anti-pattern)
5. [Monorepo Considerations](#5-monorepo-considerations)
6. [CI Validation](#6-ci-validation)

---

## 1. Directory Patterns

### Pattern A: Centralized `src/generated/` (recommended default)

All generated code in one place. Clear separation from hand-written code.

```
project/
├── src/
│   ├── generated/           ← all generated code here
│   │   ├── api.client.ts
│   │   ├── api.schemas.ts
│   │   ├── user.types.ts
│   │   └── index.ts         ← barrel re-export
│   ├── services/
│   │   └── user.service.ts  ← hand-written; imports from generated/
│   └── index.ts
├── codegen/
│   ├── config.ts            ← generation configuration
│   └── plugins/             ← custom plugins
├── spec/
│   └── api.yaml             ← source schema
└── tsconfig.json
```

**Use when**: One schema drives most generation; clean team boundaries.

### Pattern B: Near-Operation-File (GraphQL Code Generator style)

Generated file lives next to the file that "owns" it.

```
src/
├── features/
│   ├── users/
│   │   ├── UserList.tsx             ← hand-written component
│   │   ├── UserList.graphql         ← GraphQL operation
│   │   └── UserList.generated.tsx   ← generated types for this component
│   └── products/
│       ├── ProductCard.tsx
│       ├── ProductCard.graphql
│       └── ProductCard.generated.tsx
└── generated/
    └── schema.ts                    ← shared schema types (not per-component)
```

**Use when**: Each component/feature "owns" its queries; scales well in large codebases.

### Pattern C: Mirror Source Structure (proto/spec → generated)

Generated output mirrors the spec directory hierarchy.

```
proto/
├── user/
│   └── user.proto
└── product/
    └── product.proto

src/generated/
├── user/
│   └── user.ts         ← generated from proto/user/user.proto
└── product/
    └── product.ts      ← generated from proto/product/product.proto
```

**Use when**: Mapping between input and output must be obvious; protobuf or multi-file specs.

### Pattern D: Per-Adapter, Separate Package (Smithy TypeScript / large SDK style)

Generated code is isolated in its own package within a monorepo.

```
packages/
├── api-spec/                ← source schemas
│   └── api.smithy
├── api-client/              ← generated (own package)
│   ├── src/
│   │   ├── commands/
│   │   │   ├── GetUser.ts
│   │   │   └── CreateUser.ts
│   │   ├── models/
│   │   │   └── User.ts
│   │   └── index.ts
│   └── package.json
└── my-app/                  ← hand-written; depends on api-client
    └── package.json
```

**Use when**: Generated client is a published library; generation is heavyweight; multiple
consumers of the same generated code.

---

## 2. Naming Conventions

### File suffixes

| Convention | Example | Used by |
|---|---|---|
| `.generated.ts` | `UserList.generated.ts` | GraphQL Code Generator |
| `.gen.ts` | `api.gen.ts` | Various |
| `.ts` (in `generated/`) | `generated/api.ts` | Prisma, Orval |
| `.pb.ts` | `user.pb.ts` | protobuf-ts |
| `_pb.ts` | `user_pb.ts` | Google style |

**Recommendation**: Use `.generated.ts` suffix for co-located files (Pattern B) or plain `.ts`
inside a `generated/` directory (Pattern A). Avoid cryptic suffixes.

### Directory names

- `generated/` — clear, universal, recognized by many tools
- `__generated__/` — Relay-style (older convention)
- `.generated/` — hidden directories (avoid — tools may skip them)
- `gen/` — short but ambiguous

**Recommendation**: Use `generated/` (no underscores, no dots).

### Barrel exports

Always create a `src/generated/index.ts` that re-exports everything:

```typescript
// src/generated/index.ts
// @generated DO NOT EDIT
export * from "./api.client";
export * from "./api.schemas";
export type * from "./user.types";
```

This lets consumers write `import { User } from "@/generated"` rather than specific files.

---

## 3. Git Strategy

### Commit generated files (recommended default)

**Arguments for committing**:
- Teammates can use generated types immediately after `git pull` without running codegen
- CI sees generated types without a build step
- `git blame` and `git log` show when generated types changed (useful for debugging)
- IDE works without running any command
- Diff shows exactly what changed when spec is updated

**CI staleness check** (works only when files are committed):

```bash
pnpm codegen && git diff --exit-code src/generated/
```

### Git-ignore generated files

**Arguments for ignoring**:
- No noisy diffs when spec updates frequently
- Forces developers to always run codegen (ensures freshness)
- Smaller repository size

**Requirements when ignoring**:
- Must guarantee codegen runs automatically (postinstall, predev)
- CI must run codegen before type-check step
- New developers must know to run codegen

```json
// package.json
{
  "scripts": {
    "postinstall": "pnpm codegen",
    "predev": "pnpm codegen"
  }
}
```

### Decision guide

```
Is generated output large (>10k lines) AND changes frequently? → Git-ignore
Is generated output small OR changes infrequently?           → Commit
Is this a library with consumers?                            → Commit (part of public API)
Do you have a postinstall hook?                              → Either works
```

### .gitignore entries

```gitignore
# If ignoring generated files:
src/generated/
.codegen-info.json

# Always ignore build artifacts:
.codegen-info.json
```

---

## 4. The node_modules Anti-Pattern (Prisma Lesson)

This is one of the most important lessons from production code generation at scale.

### What Prisma did

Historically, `prisma generate` wrote the generated client to `node_modules/.prisma/client/`.
The intent was to make it feel like a regular npm package (`import { PrismaClient } from "@prisma/client"`).

### Why it became a problem

1. **TypeScript Language Server ignores `node_modules/`** — changes were invisible to IDEs until
   the TS server was restarted. Prisma had to add a VS Code extension that automatically restarts
   the TS server after every generation.

2. **Package manager conflicts** — package managers (pnpm, yarn, npm) assume they own
   `node_modules/`. Running `pnpm install` could delete or overwrite the generated client.

3. **Monorepo complications** — hoisting rules in pnpm/yarn workspaces break generation paths.
   Prisma had to ship `@prisma/nextjs-monorepo-workaround-plugin` specifically for this.

4. **Docker layer caching** — generated files in `node_modules/` prevented Docker cache
   reuse, bloating image build times.

5. **gitignore conventions** — most `.gitignore` templates ignore `node_modules/`, hiding
   the generated client from version control unexpectedly.

### What Prisma v7 does instead

Prisma v7 removes `node_modules/` as a generation target. You must specify an explicit path:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"  // explicit src/ path required
}
```

### The lesson

**Never generate into `node_modules/`.** Generate into explicit paths under `src/` or a
dedicated package directory. This is now considered an industry anti-pattern.

---

## 5. Monorepo Considerations

### Shared generated types package

For monorepos with multiple apps consuming the same schema:

```
packages/
├── api-types/              ← generated types package
│   ├── src/
│   │   └── generated/
│   │       ├── api.ts
│   │       └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── web-app/
│   └── package.json        ← depends on workspace:api-types
└── mobile-app/
    └── package.json        ← depends on workspace:api-types
```

### Generation in the right package

Run codegen from the package that owns the spec:

```json
// packages/api-types/package.json
{
  "name": "@myorg/api-types",
  "scripts": {
    "codegen": "tsx ../../codegen/config.ts --output ./src/generated/"
  }
}
```

### tsconfig project references

Generated types package needs `composite: true`:

```json
// packages/api-types/tsconfig.json
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"]
}
```

### pnpm workspace codegen script

Run codegen across all packages from root:

```json
// root package.json
{
  "scripts": {
    "codegen": "pnpm --filter '*' run codegen --if-present"
  }
}
```

---

## 6. CI Validation

Validate that generated files are up-to-date in CI:

```yaml
# .github/workflows/ci.yml
jobs:
  check-generated:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install
      - name: Regenerate
        run: pnpm codegen
      - name: Check for stale generated files
        run: |
          git diff --exit-code src/generated/ || {
            echo "Generated files are stale!"
            echo "Run 'pnpm codegen' locally and commit the result."
            git diff --name-only src/generated/
            exit 1
          }
```

### Alternative: hash-based check

```bash
# Generate and compare hashes instead of git diff (works with git-ignored files too)
BEFORE=$(find src/generated -type f | sort | xargs sha256sum | sha256sum)
pnpm codegen
AFTER=$(find src/generated -type f | sort | xargs sha256sum | sha256sum)

if [ "$BEFORE" != "$AFTER" ]; then
  echo "Generated files changed after codegen — spec may be out of date"
  exit 1
fi
```
