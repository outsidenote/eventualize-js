# Generation Approaches — Deep Dive

Reference file for [../SKILL.md](../SKILL.md).

## Table of Contents

1. [Template-Based (Handlebars)](#1-template-based-handlebars)
2. [DSL-Based (ts-poet)](#2-dsl-based-ts-poet)
3. [AST-Based (ts-morph)](#3-ast-based-ts-morph)
4. [TypeScript Compiler Plugin](#4-typescript-compiler-plugin)
5. [Protoc Plugin (stdin/stdout)](#5-protoc-plugin-stdinstdout)
6. [Preset Composition](#6-preset-composition)
7. [Decision Matrix](#7-decision-matrix)

---

## 1. Template-Based (Handlebars)

**Libraries**: openapi-zod-client, OpenAPI TypeScript Codegen, Orval

### How It Works

Data model (parsed from spec) is fed into Handlebars templates. The template controls structure;
the data controls values.

```handlebars
{{!-- templates/interface.hbs --}}
export interface {{classname}} {
  {{#vars}}
  {{name}}{{#isRequired}}!{{/isRequired}}: {{datatype}};
  {{/vars}}
}

{{#hasImports}}
{{#imports}}import { {{classname}} } from './{{classFilename}}';
{{/imports}}
{{/hasImports}}
```

### Customization Points

- **Override templates**: Pass `--template ./my-templates/` to CLI
- **Custom helpers**: Register Handlebars helpers in config
- **Extension properties**: Support `x-` fields in OpenAPI spec to override behavior per-endpoint

```yaml
# openapi.yaml
paths:
  /users:
    get:
      x-custom-return-type: UserPage  # overrides generated return type
```

### Strengths & Limits

| Strengths | Limits |
|---|---|
| Human-readable templates | Limited logic (no recursion, no complex transforms) |
| Non-programmers can modify | Hard to debug template issues |
| Deterministic output | Coupling: template shape must match data shape |
| Easy to diff template changes | Import management is manual |

### When to Choose

Choose Handlebars when:
- Input schema is external (OpenAPI, AsyncAPI, GraphQL SDL)
- Output shape mirrors input structure directly
- Team wants to customize templates without TypeScript knowledge
- Generation logic is simple (no computed relationships between types)

---

## 2. DSL-Based (ts-poet)

**Library**: ts-poet (used internally by ts-proto, Smithy TypeScript)

### How It Works

TypeScript functions return `code` tagged template literals. ts-poet assembles them into a file,
tracking and deduplicating imports automatically.

```typescript
import { imp, code, joinCode } from "ts-poet";

// Declare imports — ts-poet only emits used ones
const Observable = imp("Observable@rxjs");
const Subject = imp("Subject@rxjs");
const Logger = imp("Logger@./logger");

function generateEventBus(events: string[]) {
  return code`
    export class EventBus {
      private logger = new ${Logger}();

      ${joinCode(events.map(e => code`
        private ${e}$ = new ${Subject}<${e}Event>();
      `))}

      observe(obs: ${Observable}<void>) {
        obs.subscribe(() => this.logger.log("triggered"));
      }
    }
  `;
}
```

### Import Syntax Reference

```typescript
imp("Observable@rxjs")          // named: import { Observable } from "rxjs"
imp("Observable:Obs@rxjs")      // renamed: import { Observable as Obs } from "rxjs"
imp("t:Observable@rxjs")        // type-only: import type { Observable } from "rxjs"
imp("api*./Api")                // namespace: import * as api from "./Api"
imp("api=./Api")                // default: import api from "./Api"
```

### Conflict Resolution

ts-poet automatically renames colliding imports:

```typescript
const A = imp("Message@./proto-a");
const B = imp("Message@./proto-b");
// Output:
// import { Message } from "./proto-a";
// import { Message as Message1 } from "./proto-b";
```

### Strengths & Limits

| Strengths | Limits |
|---|---|
| Auto import management | Requires TypeScript knowledge to customize |
| Fully composable (functions return code) | More verbose than templates |
| Type-safe throughout | dprint/Prettier needed for formatting |
| Handles collisions automatically | |

### When to Choose

Choose ts-poet DSL when:
- Generating complex code with many cross-references
- Import management would otherwise be painful
- You want composable generator functions
- Output has many computed relationships (not just structural mapping)

---

## 3. AST-Based (ts-morph)

**Library**: ts-morph (wraps TypeScript Compiler API)

### How It Works

Read existing TypeScript source files via the project API, traverse the AST, and emit new
source files programmatically.

```typescript
import { Project, StructureKind } from "ts-morph";

const project = new Project({ tsConfigFilePath: "./tsconfig.json" });

// Read existing source
const modelFile = project.getSourceFileOrThrow("./src/model.ts");

for (const iface of modelFile.getInterfaces()) {
  const name = iface.getName();
  const props = iface.getProperties();

  // Generate codec file alongside model
  const codecFile = project.createSourceFile(
    `./src/generated/${name}.codec.ts`,
    {
      statements: [
        {
          kind: StructureKind.ImportDeclaration,
          moduleSpecifier: `../model`,
          namedImports: [name],
        },
        {
          kind: StructureKind.Function,
          name: `encode${name}`,
          isExported: true,
          parameters: [{ name: "value", type: name }],
          returnType: "Uint8Array",
          statements: `// encode ${name}`,
        },
      ],
    },
    { overwrite: true }
  );
}

await project.save();
```

### Visitor Pattern

```typescript
// Traverse all descendants looking for specific patterns
modelFile.forEachDescendant((node) => {
  if (Node.isClassDeclaration(node)) {
    const decorators = node.getDecorators();
    const hasEntity = decorators.some(d => d.getName() === "Entity");
    if (hasEntity) generateRepository(node);
  }
});
```

### Strengths & Limits

| Strengths | Limits |
|---|---|
| Full semantic understanding of TypeScript | Steep learning curve |
| IDE autocomplete/navigation works on output | Verbose API for simple cases |
| Can read + write in same operation | Slower than template-based for pure generation |
| Guaranteed valid syntax | Requires project setup |

### When to Choose

Choose ts-morph when:
- Input is your own TypeScript code (decorators, annotations)
- You need to read type information to drive generation
- You're building codemods or refactoring tools
- Output must be semantically correct (not just syntactically)

---

## 4. TypeScript Compiler Plugin

**Libraries**: NestJS Swagger, Angular compiler

### How It Works

Configured in `tsconfig.json` (or framework config), the plugin runs during compilation. It reads
the AST of your source code and injects additional metadata or generates derived declarations.

**NestJS Swagger pattern** — reads controller decorators at compile time:

```typescript
// Before plugin: you write this
@Get('/users')
@ApiOperation({ summary: 'List users' })
findAll(): User[] { ... }

// Plugin infers and injects the response type automatically from the return type
// No need to repeat: @ApiResponse({ type: User, isArray: true })
```

Plugin configuration:

```json
// nest-cli.json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@nestjs/swagger/plugin",
        "options": {
          "dtoFileNameSuffix": [".dto.ts", ".entity.ts"],
          "controllerFileNameSuffix": [".controller.ts"],
          "introspectComments": true
        }
      }
    ]
  }
}
```

### TypeScript Language Service Plugin (IDE only)

Different from compiler plugins — affects editing experience only, not compilation output.

```typescript
// plugin.ts — loaded via tsconfig.json plugins[]
import type * as ts from "typescript";

function init(modules: { typescript: typeof ts }) {
  const ts = modules.typescript;

  function create(info: ts.server.PluginCreateInfo) {
    const proxy = { ...info.languageService };

    // Intercept completions
    proxy.getCompletionsAtPosition = (fileName, position, options) => {
      const original = info.languageService.getCompletionsAtPosition(
        fileName, position, options
      );
      // Add custom completions for your DSL
      return original;
    };

    return proxy;
  }

  return { create };
}

export = init;
```

### Strengths & Limits

| Strengths | Limits |
|---|---|
| Zero extra build step | Only works via programmatic API or NestJS CLI |
| Always synchronized with source | Cannot use plain `tsc` CLI |
| No generated files to manage | Harder to debug plugin logic |
| IDE sees same code | Limited to what TS plugin API exposes |

### When to Choose

Choose compiler plugins when:
- Input is your own TypeScript with decorators/annotations
- You want zero-friction (no separate generation command)
- Source and generated behavior must always be in sync
- Target framework (NestJS) already supports plugin system

---

## 5. Protoc Plugin (stdin/stdout)

**Libraries**: protobuf-ts, ts-proto

### How It Works

The protoc compiler reads `.proto` files and passes a `CodeGeneratorRequest` binary to your
plugin via stdin. The plugin returns a `CodeGeneratorResponse` via stdout.

```
protoc --plugin=protoc-gen-ts=./node_modules/.bin/protoc-gen-ts \
       --ts_out=./src/generated \
       --proto_path=./proto \
       api.proto
```

### Three-Layer Architecture (from protobuf-ts)

```
Layer 1: Generated Code (lightweight)
  - TypeScript interfaces for each message
  - encode/decode methods
  - Never imports from framework
  - Deterministic: same .proto → same output

Layer 2: Runtime Library (@protobuf-ts/runtime)
  - Wire format encoding/decoding
  - Shared across all generated code
  - Versioned independently

Layer 3: Transport (separate packages)
  - @protobuf-ts/grpc-transport
  - @protobuf-ts/twirp-transport
  - Pick only what you need
```

### Generated Output Pattern (ts-proto style)

```typescript
// generated: api.ts
export interface User {
  id: number;
  name: string;
  email: string;
}

export const User = {
  create(base?: DeepPartial<User>): User {
    return { id: 0, name: "", email: "", ...base };
  },
  encode(message: User, writer = Writer.create()): Writer {
    // binary encoding
    return writer;
  },
  decode(input: Reader | Uint8Array): User {
    // binary decoding
  },
  toJSON(message: User): unknown { ... },
  fromJSON(object: unknown): User { ... },
};
```

### When to Choose

Choose protoc plugin when:
- Source schema is Protocol Buffers
- You need binary serialization
- gRPC service generation is required
- Schema is shared across multiple languages

---

## 6. Preset Composition

**Libraries**: Modelina, GraphQL Code Generator presets

### How It Works

Presets stack transformations. Each preset receives the accumulated output from previous presets
and can extend, modify, or replace it.

```typescript
// From Modelina pattern
const presets = [
  // Base: standard TypeScript interface
  {
    interface: {
      property({ content, propertyName }) {
        return content; // pass through unchanged
      }
    }
  },
  // Layer 2: add JSDoc from schema description
  {
    interface: {
      property({ content, model, propertyName }) {
        const prop = model.properties[propertyName];
        return `/** ${prop.description} */\n${content}`;
      }
    }
  },
  // Layer 3: organization conventions
  {
    interface: {
      additionalContent({ content, model }) {
        return `${content}\n// @internal: auto-generated from ${model.name}`;
      }
    }
  }
];
```

### Plugin Architecture (GraphQL Code Generator)

```typescript
// Plugin interface
interface CodegenPlugin<T = object> {
  plugin: (
    schema: GraphQLSchema,
    documents: Types.DocumentFile[],
    config: T,
    info?: { outputFile?: string }
  ) => Types.PluginOutput | Promise<Types.PluginOutput>;

  validate?: (
    schema: GraphQLSchema,
    documents: Types.DocumentFile[],
    config: T,
    outputFile: string,
    allPlugins: Types.ConfiguredPlugin[]
  ) => void | Promise<void>;
}
```

### Constraint System (for naming, reserved words)

```typescript
const constraints = {
  modelName: ({ modelName, reservedKeywordCallback }) => {
    const sanitized = toPascalCase(modelName);
    if (isReservedWord(sanitized)) {
      return reservedKeywordCallback?.(sanitized) ?? `${sanitized}Model`;
    }
    return sanitized;
  },
  propertyName: ({ propertyName }) => toCamelCase(propertyName),
  enumKey: ({ enumKey }) => toScreamingSnakeCase(enumKey),
};
```

### When to Choose

Choose preset composition when:
- Multiple schemas from different sources (AsyncAPI + OpenAPI + JSON Schema)
- Team wants to layer organization conventions without modifying core
- You need reusable preset libraries across projects
- Complex constraint enforcement (naming, validation, reserved words)

---

## 7. Decision Matrix

| Factor | Handlebars | ts-poet DSL | ts-morph AST | Compiler Plugin | Protoc |
|---|---|---|---|---|---|
| Input type | External schema | Any | TypeScript code | TypeScript code | .proto files |
| Complexity | Low-Medium | Medium-High | High | High | Medium |
| IDE transparency | Good | Excellent | Excellent | Best (no files) | Good |
| Customizability | Templates | Code | Code | Limited | Plugins |
| Watch mode | Easy | Easy | Moderate | Native | Build-time |
| Team accessibility | High (templates) | Low (need TS) | Low (need TS) | Low | Medium |
| Generated file count | Configurable | Configurable | Per-type | None (inline) | Per-.proto |
