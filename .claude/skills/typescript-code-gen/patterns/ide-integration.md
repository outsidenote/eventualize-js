# IDE Integration — Deep Dive

Reference file for [../SKILL.md](../SKILL.md).

## Table of Contents

1. [TypeScript Language Server — How It Picks Up Generated Files](#1-typescript-language-server)
2. [Source Maps for Generated Code](#2-source-maps)
3. [Language Service Plugin](#3-language-service-plugin)
4. [Language Server Protocol (LSP) Extension](#4-lsp-extension)
5. [@generated Headers and Markers](#5-generated-headers)
6. [VSCode Settings for Generated Directories](#6-vscode-settings)

---

## 1. TypeScript Language Server

The TypeScript Language Server (used by VS Code, Neovim LSP, WebStorm, etc.) automatically
watches files matching your `tsconfig.json` `include` patterns.

### Key insight: generate into `src/`, not `node_modules/`

The TS language server watches `src/**/*.ts` but **does not watch `node_modules/`**.

- `src/generated/` → TS server sees new files immediately ✅
- `node_modules/.prisma/client/` → TS server misses changes, requires restart ❌

This is why Prisma's VS Code extension had to implement a workaround that restarts the TS
language server after every `prisma generate` — a problem eliminated in Prisma v7 by requiring
explicit `output` paths outside `node_modules/`.

### tsconfig.json configuration

Ensure generated files are included:

```json
{
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": {
      "@generated/*": ["./src/generated/*"]  // optional alias
    }
  },
  "include": ["src/**/*.ts"],   // picks up src/generated/ automatically
  "exclude": ["node_modules", "dist"]
}
```

### Exclude from linting but include in type checking

```json
// .eslintrc.json or eslint.config.js
{
  "ignorePatterns": ["src/generated/**"]
}
```

---

## 2. Source Maps

Source maps allow developers to debug through generated code back to the original schema or
template, and provide "Go to Source" navigation in IDEs.

### Enabling source maps in TypeScript

```json
// tsconfig.json
{
  "compilerOptions": {
    "sourceMap": true,        // generates .js.map alongside .js
    "declarationMap": true,   // generates .d.ts.map alongside .d.ts
    "inlineSources": true     // embeds original source in map (no separate file needed)
  }
}
```

### Generating source maps in custom generators

Use the `source-map` library to emit maps that point back to the spec:

```typescript
import { SourceMapGenerator } from "source-map";

function generateWithSourceMap(specPath: string, outputPath: string) {
  const map = new SourceMapGenerator({ file: outputPath });
  let outputLine = 1;

  // As you generate each line, add a mapping
  function emitLine(content: string, specLine: number, specCol: number) {
    map.addMapping({
      generated: { line: outputLine, column: 0 },
      source: specPath,
      original: { line: specLine, column: specCol },
      name: undefined,
    });
    outputLine++;
    return content + "\n";
  }

  let output = "";
  output += emitLine(`export interface User {`, 10, 0);
  output += emitLine(`  id: number;`, 11, 2);
  output += emitLine(`}`, 12, 0);

  // Append source map URL
  output += `\n//# sourceMappingURL=${outputPath}.map\n`;

  return { code: output, map: map.toString() };
}
```

### When source maps matter most

- **Template-based generators**: Map generated TS lines back to Handlebars template lines
- **Proto generators**: Map generated interfaces back to `.proto` message field numbers
- **Stack traces**: When generated code throws at runtime, map to schema origin

---

## 3. Language Service Plugin

A TypeScript Language Service plugin enhances the editing experience for consumers of your
generated code — adding custom completions, diagnostics, or hover information.

### Plugin Structure

```typescript
// my-codegen-ls-plugin/index.ts
import type * as ts from "typescript";

function init(modules: { typescript: typeof ts }) {
  const ts = modules.typescript;

  function create(info: ts.server.PluginCreateInfo): ts.LanguageService {
    // Create a proxy that wraps the original language service
    const proxy: ts.LanguageService = Object.create(null);
    for (const k of Object.keys(info.languageService) as Array<keyof ts.LanguageService>) {
      const x = info.languageService[k];
      (proxy as Record<string, unknown>)[k] =
        typeof x === "function" ? (...args: unknown[]) => (x as Function).apply(info.languageService, args) : x;
    }

    // Override specific methods
    proxy.getCompletionsAtPosition = (fileName, position, options) => {
      const original = info.languageService.getCompletionsAtPosition(
        fileName, position, options
      );

      // Add custom completions for your DSL keywords
      if (isInYourDSLContext(fileName, position, info)) {
        original?.entries.push(
          { name: "MyCustomType", kind: ts.ScriptElementKind.typeElement, sortText: "0" }
        );
      }

      return original;
    };

    // Add custom diagnostics
    proxy.getSemanticDiagnostics = (fileName) => {
      const original = info.languageService.getSemanticDiagnostics(fileName);
      const custom = checkYourCustomRules(fileName, info);
      return [...original, ...custom];
    };

    return proxy;
  }

  return { create };
}

export = init;
```

### Registering the plugin

```json
// tsconfig.json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "my-codegen-ls-plugin",
        "options": { "specDir": "./spec" }
      }
    ]
  }
}
```

```bash
npm install --save-dev my-codegen-ls-plugin
```

### Plugin capabilities

| Can Do | Cannot Do |
|---|---|
| Custom completions | Alter TypeScript type checking |
| Custom diagnostics (IDE only) | Affect `tsc` CLI compilation |
| Custom hover info | Add new syntax |
| Custom navigation (go-to-def) | Import new types into user files |
| String literal completions | Change emitted JavaScript |

### Real-world examples

- **GraphQL Language Service**: Provides field completions inside `gql` template literals
- **Prisma Language Server**: Schema completions, validation for `.prisma` files
- **Angular Language Server**: Template expression type checking

---

## 4. LSP Extension

For more powerful IDE integration (beyond TypeScript-only), implement a Language Server Protocol
extension. This works across VS Code, Neovim, Emacs, and any LSP-compliant editor.

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│ VS Code Extension (Language Client)                      │
│  - Full VS Code API access                               │
│  - File system events                                     │
│  - UI elements (status bar, output channel)             │
└─────────────────────────────┬────────────────────────────┘
                              │ Language Server Protocol
                              │ (JSON-RPC over stdio/TCP)
┌─────────────────────────────▼────────────────────────────┐
│ Language Server (separate process)                       │
│  - Analyzes your schema/spec files                       │
│  - Provides completions, hover, diagnostics              │
│  - Triggers code generation                              │
└──────────────────────────────────────────────────────────┘
```

### Minimal VS Code extension with file watcher

```typescript
// extension.ts (VS Code extension entry point)
import * as vscode from "vscode";
import { spawn } from "node:child_process";

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("My Codegen");
  context.subscriptions.push(outputChannel);

  // Watch spec files
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      vscode.workspace.workspaceFolders![0],
      "spec/**/*.yaml"
    )
  );

  const generate = async (uri: vscode.Uri) => {
    outputChannel.show();
    outputChannel.appendLine(`Regenerating from ${uri.fsPath}...`);

    const proc = spawn("pnpm", ["codegen"], {
      cwd: vscode.workspace.workspaceFolders![0].uri.fsPath,
    });

    proc.stdout.on("data", (data: Buffer) => outputChannel.append(data.toString()));
    proc.stderr.on("data", (data: Buffer) => outputChannel.append(data.toString()));

    await new Promise<void>((resolve, reject) => {
      proc.on("exit", (code) => {
        if (code === 0) {
          outputChannel.appendLine("Done.");
          resolve();
        } else {
          vscode.window.showErrorMessage(`Codegen failed with exit code ${code}`);
          reject(new Error(`exit ${code}`));
        }
      });
    });
  };

  watcher.onDidChange(generate);
  watcher.onDidCreate(generate);

  context.subscriptions.push(watcher);
}
```

---

## 5. @generated Headers

Every generated file must declare itself generated. This enables:
- IDEs to show "Go to Source" pointing to spec (not generated file)
- ESLint/Biome to skip generated files
- Developers to know not to edit manually
- CI to detect stale generated files

### Standard header

```typescript
/**
 * @generated DO NOT EDIT MANUALLY
 *
 * Generator:  my-codegen v1.2.3
 * Source:     ./spec/api.yaml (sha256: abc123...)
 * Generated:  2026-03-08T14:23:45Z
 *
 * To regenerate: pnpm codegen
 */
```

### Minimal header (when file size matters)

```typescript
// @generated — DO NOT EDIT. Source: ./spec/api.yaml. Run: pnpm codegen
```

### ESLint: skip generated files

```javascript
// eslint.config.js
export default [
  { ignores: ["src/generated/**"] },
  // ... rest of config
];
```

### Biome: skip generated files

```json
// biome.json
{
  "files": {
    "ignore": ["src/generated/**"]
  }
}
```

### TypeScript: suppress errors in generated files

If generated files contain patterns that trigger TS errors, add per-file suppression
(preferred over disabling in tsconfig):

```typescript
// @generated DO NOT EDIT
/* eslint-disable */
// @ts-nocheck  ← use only as last resort; prefer fixing the generator

export interface GeneratedType { ... }
```

---

## 6. VSCode Settings for Generated Directories

Control how VS Code treats generated directories:

```json
// .vscode/settings.json
{
  // Hide generated files from file explorer (they're noise)
  "files.exclude": {
    "src/generated": false   // set true to hide, false to show (default)
  },

  // Exclude from global search
  "search.exclude": {
    "src/generated/**": true,
    "**/.codegen-info.json": true
  },

  // Show generated files in breadcrumbs and outline (useful for navigation)
  "breadcrumbs.enabled": true,

  // TypeScript: ensure generated directory is indexed
  "typescript.tsdk": "./node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,

  // If using path aliases for generated types
  "typescript.preferences.importModuleSpecifier": "shortest"
}
```

### Recommended: show generated files by default

Keep `"files.exclude": {}` empty (don't hide generated files). Developers should see and be
able to navigate generated code — this is the transparency mandate. If generated files are
hidden, it undermines the IDE-transparency goal.
