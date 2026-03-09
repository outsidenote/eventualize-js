---
name: typescript-code-gen
description: "TypeScript source code generation patterns, best practices, and IDE transparency strategies. Use when implementing codegen, generating TypeScript from schemas, setting up watch mode for background code generation, integrating generated files with the IDE (VSCode), or choosing between generation approaches. Covers: Handlebars templates, AST generation with ts-morph, TypeScript compiler plugins, DSL-based generation (ts-poet), protoc plugins (protobuf-ts), preset composition, plugin architectures (GraphQL Code Generator, Smithy TypeScript), file watching with debounce and hash-based incremental invalidation, Language Service plugins, source maps for generated code, @generated markers, do-not-edit headers, file organization (src/generated vs node_modules anti-pattern), Prisma generate, Orval, openapi-zod-client, NestJS Swagger plugin, schema-to-TypeScript, OpenAPI codegen, GraphQL codegen."
---

# TypeScript Code Generation

Expert guidance on building transparent, IDE-first TypeScript code generation systems.

---

## The Transparency Mandate

> Generated code must be **readable, type-safe, and IDE-first**. Developers should be able to
> navigate generated types, see hover docs, and debug through it — exactly like hand-written code.

Core rules:

1. Generate into `src/generated/` — **never** into `node_modules`
2. Every generated file must fully type-check (zero `any`, zero suppression comments)
3. Add `@generated` headers referencing the source schema
4. Enable source maps for template/schema debugging
5. Keep generated files committed to version control (by default) so teammates see them immediately

---

## Core Decision Framework

Choose your generation approach based on what drives the generation:

```
What is your input?
├── External schema (OpenAPI, GraphQL, proto, AsyncAPI)
│   ├── Simple structural mapping → Template (Handlebars)  
│   └── Complex logic / runtime validation → DSL  [ts-poet]
├── Your own TypeScript code (decorators, annotations)
│   └── Compile-time injection → Compiler Plugin  
├── Protocol buffers
│   └── Protoc plugin (stdin/stdout)  
└── Multiple heterogeneous schemas
    └── Preset composition 
```

See [patterns/generation-approaches.md](patterns/generation-approaches.md) for deep dive.

---

## Generation Approaches

### 1. Template-Based (Handlebars)

Best for: Simple, structural spec-to-code where the output shape mirrors the input schema.

```handlebars
{{! templates/interface.hbs }}
export interface
{{classname}}
{
{{#vars}}
  {{name}}{{#isRequired}}!{{/isRequired}}:
  {{datatype}};
{{/vars}}
}
```

**Escape hatch**: Support `x-` extension properties in source schema to override generation
**Limit**: Template logic is constrained — fall back to DSL for complex transformations

### 2. DSL-Based (ts-poet)

Best for: Code-to-code generation where you need full TypeScript expressiveness.

```typescript
import { imp, code } from "ts-poet";

const Observable = imp("Observable@rxjs");

function generateService(name: string) {
  return code`
    export class ${name}Service {
      constructor(private obs: ${Observable}) {}
    }
  `;
}
```

**Key feature**: Auto-import management — declare imports with `imp()`, ts-poet tracks usage
and deduplicate/renames on collision. No manual import bookkeeping.

### 3. AST-Based 

Best for: Semantic transforms, reading existing TypeScript to generate derived code.

```typescript
import { Project } from "ts-morph";

const project = new Project({ tsConfigFilePath: "./tsconfig.json" });
const source = project.getSourceFileOrThrow("./src/model.ts");

source.getInterfaces().forEach((iface) => {
  // Read interface → generate serializer
  const serializer = generateSerializer(iface);
  project.createSourceFile(`./src/generated/${iface.getName()}.codec.ts`, serializer);
});

await project.save();
```

**Advantage**: IDE has full semantic understanding of output. ts-morph wraps the raw
Compiler API with a fluent interface — prefer it over raw `ts.factory.*` calls.

### 4. TypeScript Compiler Plugin (NestJS pattern)

Best for: Build-time code injection without separate generation step. Plugin runs during `tsc`.

```json
// nest-cli.json or tsconfig.json
{
  "compilerOptions": {
    "plugins": ["@nestjs/swagger/plugin"]
  }
}
```

**Advantage**: Zero separate generation step — always up-to-date at compile time.
**Limitation**: Plugin logic only runs via programmatic API or NestJS CLI, not plain `tsc`.

### 5. Protoc Plugin (stdin/stdout)

Best for: Protocol buffer schemas → TypeScript. Deterministic, pure-function generation.

```
Input:  CodeGeneratorRequest (protobuf binary) → stdin
Output: CodeGeneratorResponse (protobuf binary) → stdout
```

**Libraries**: protobuf-ts, ts-proto
**Key pattern** (3-layer separation from protobuf-ts):

- **Layer 1 (generated)**: Lightweight interfaces + codec methods — never imports from framework
- **Layer 2 (runtime)**: `@protobuf-ts/runtime` — shared, versioned independently
- **Layer 3 (transport)**: Separate packages for gRPC, Twirp, etc.

---

## Watch Mode

For IDE transparency, generation must happen continuously in the background.

### Pattern 1: File Watcher + Debounce

```typescript
import { subscribe } from "@parcel/watcher";

const watcher = await subscribe(
  "./spec",
  async (err, events) => {
    if (err) throw err;
    // Debounce: batch rapid saves into one regeneration
    scheduleRegeneration(events);
  },
  { ignore: ["node_modules", ".git"] },
);

function scheduleRegeneration(events: Event[]) {
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => regenerate(events), 200); // 200ms debounce
}
```

**Debounce duration**: 100–300ms. A single file save on Linux triggers 3–5 inotify events.

### Pattern 2: Vite Plugin (build-tool integration)

```typescript
export function codegenPlugin(): Plugin {
  return {
    name: "typescript-codegen",
    async handleHotUpdate({ file, server }) {
      if (file.endsWith(".proto") || file.endsWith(".openapi.yaml")) {
        await regenerate(file);
        server.ws.send({ type: "full-reload" });
      }
    },
  };
}
```

### Hash-Based Incremental Invalidation

Skip regeneration when inputs haven't changed:

```typescript
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

interface BuildInfo {
  inputs: Record<string, string>; // path → sha256
  outputs: Record<string, string>; // path → sha256
}

async function regenerateIfChanged(specPath: string) {
  const buildInfo = readBuildInfo();
  const currentHash = hashFile(specPath);

  if (buildInfo.inputs[specPath] === currentHash) return; // Skip

  const generated = await generate(specPath);
  writeBuildInfo({ ...buildInfo, inputs: { [specPath]: currentHash } });
  writeGeneratedFiles(generated);
}
```

**Use content hashes, not timestamps** — timestamps are unreliable across file copies and CI.

See [patterns/watch-mode.md](patterns/watch-mode.md) for complete patterns including `.codegen-info` buildinfo.

---

## File Organization

### Recommended Structure

```
project/
├── src/
│   ├── generated/           ← ALL generated code lives here
│   │   ├── api.client.ts    ← generated (committed)
│   │   ├── api.schemas.ts   ← generated (committed)
│   │   └── index.ts         ← generated barrel export
│   └── services/            ← hand-written code
├── codegen/
│   ├── config.ts            ← generation configuration
│   └── plugins/             ← custom generator plugins
└── spec/
    └── openapi.yaml         ← source schema (drives generation)
```

### Naming Conventions

- `*.generated.ts` — co-located with source (GraphQL Code Generator style)
- `src/generated/*.ts` — centralized output directory
- Never: files in `node_modules/` that need IDE restart after generation

### What to Commit

**Commit generated files** (default). Rationale:

- Teammates see generated types immediately without running codegen
- CI can detect when generated files are stale (run codegen, assert no diff)
- TypeScript language server works without a build step

**Git-ignore generated files** only when:

- Generation is guaranteed to run in postinstall
- Files change so frequently they create noisy diffs
- Files are truly derived and add zero value to blame/history

See [patterns/file-organization.md](patterns/file-organization.md) for complete patterns.

---

## Plugin Architecture

### Pre/Post Hook System (GraphQL Code Generator model)

```typescript
interface CodegenHooks {
  beforeGeneration?(context: GenerationContext): Promise<void>;
  beforeProcessFile?(file: InputFile): Promise<void>;
  afterProcessFile?(file: InputFile, output: string): Promise<void>;
  afterGeneration?(context: GenerationContext): Promise<void>;
}
```

### Preset Composition (Modelina model)

Stack presets — each receives and transforms output from the previous:

```typescript
const presets = [
  basePresetsForLanguage(),
  organizationNamingConventions(),
  projectSpecificOverrides(),
];
// Each preset: additionalContent({ content }) => `${content}\n// extension`
```

### Constraint System (naming, reserved words)

```typescript
const constraints = {
  modelName: ({ modelName }) => {
    // Enforce PascalCase, avoid reserved words
    return toPascalCase(avoidReserved(modelName));
  },
  propertyName: ({ propertyName }) => toCamelCase(propertyName),
};
```

---

## Generated File Headers

Every generated file must have a header:

```typescript
/**
 * @generated DO NOT EDIT MANUALLY
 * Generated by: codegen/config.ts
 * Source: ./spec/openapi.yaml
 *
 * To regenerate: pnpm codegen
 */
```

**Why**: ESLint, StyleCop, and IDEs recognize `@generated` and can suppress warnings.
Developers know not to edit manually. CI can validate freshness.

---

## Anti-Patterns

| Anti-Pattern                         | Why Bad                                                                | Fix                                                        |
| ------------------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| Generate into `node_modules`         | TypeScript LS doesn't watch it; requires IDE restart; breaks monorepos | Generate into `src/generated/` with explicit `output` path |
| No `@generated` header               | Developers accidentally overwrite                                      | Always add header with source reference                    |
| Timestamp-based invalidation         | Fragile across CI/file copies                                          | Use SHA-256 content hashes                                 |
| `any` in generated code              | Defeats type safety                                                    | Use precise types; treat generated code like authored code |
| Single "god" config with all options | Not composable                                                         | Use preset/plugin composition                              |
| Full regeneration on every keystroke | Slow, CPU-intensive                                                    | Debounce (200ms) + hash-based skip                         |
| Minified or unformatted output       | Unreadable in IDE                                                      | Run Prettier on output (`prettier --write`)                |

---

## IDE Integration

### TypeScript Language Service Plugin

Augments editing experience for consumers of generated code:

```json
// tsconfig.json
{
  "compilerOptions": {
    "plugins": [{ "name": "your-codegen-ls-plugin" }]
  }
}
```

Plugin wraps Language Service to add custom completions, diagnostics, hover docs.
**Limitation**: Only affects IDE — not `tsc` CLI compilation.

### Source Maps

Enable debugging back to original schema/template:

```typescript
// tsconfig.json
{ "compilerOptions": { "sourceMap": true } }

// Generated file footer:
//# sourceMappingURL=api.client.js.map
```

See [patterns/ide-integration.md](patterns/ide-integration.md) for Language Server Protocol patterns.

---

## Quick Reference

### Choose Your Approach

```
External schema → Template (Handlebars) or DSL (ts-poet)
Your TS code   → Compiler Plugin (NestJS pattern)
Proto schemas  → Protoc plugin (stdin/stdout)
Multiple schemas → Preset composition (Modelina)
Semantic reads → AST (ts-morph)
```

### Watch Mode Checklist

- [ ] Debounce file changes (100–300ms)
- [ ] Hash inputs before regenerating (skip if unchanged)
- [ ] Use `@parcel/watcher` or Vite `handleHotUpdate` hook
- [ ] Log which file triggered regeneration
- [ ] Notify LSP after generation completes

### Generated File Checklist

- [ ] `@generated DO NOT EDIT` header with source reference
- [ ] Zero `any` types — all generated code is fully typed
- [ ] Output in `src/generated/` (not `node_modules`)
- [ ] Formatted with Prettier (readable output)
- [ ] Source maps enabled for debugging
- [ ] Committed to version control (default)

### Reference Files

- [patterns/generation-approaches.md](patterns/generation-approaches.md) — deep dive per approach
- [patterns/watch-mode.md](patterns/watch-mode.md) — watcher, debounce, buildinfo
- [patterns/ide-integration.md](patterns/ide-integration.md) — LS plugin, LSP, source maps
- [patterns/file-organization.md](patterns/file-organization.md) — directory patterns, git strategy
