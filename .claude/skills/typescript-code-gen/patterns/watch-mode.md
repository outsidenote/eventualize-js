# Watch Mode & Incremental Generation — Deep Dive

Reference file for [../SKILL.md](../SKILL.md).

## Table of Contents

1. [File Watcher Setup](#1-file-watcher-setup)
2. [Debouncing Strategy](#2-debouncing-strategy)
3. [Hash-Based Invalidation](#3-hash-based-invalidation)
4. [BuildInfo File (.codegen-info)](#4-buildinfo-file-codegen-info)
5. [Build Tool Integration (Vite, webpack)](#5-build-tool-integration)
6. [npm Scripts Pattern](#6-npm-scripts-pattern)
7. [After Generation: Notifying the IDE](#7-after-generation-notifying-the-ide)

---

## 1. File Watcher Setup

### @parcel/watcher (recommended — cross-platform, native)

Used by GraphQL Code Generator. Fast native bindings, supports recursive watching.

```typescript
import { subscribe, unsubscribe } from "@parcel/watcher";

async function startWatcher(specDir: string, generate: () => Promise<void>) {
  const subscription = await subscribe(
    specDir,
    (err, events) => {
      if (err) { console.error(err); return; }
      const relevant = events.filter(e =>
        e.path.endsWith(".proto") ||
        e.path.endsWith(".graphql") ||
        e.path.endsWith(".yaml") ||
        e.path.endsWith(".json")
      );
      if (relevant.length > 0) scheduleRegeneration(generate);
    },
    { ignore: ["node_modules", ".git", "src/generated"] }
  );

  process.on("SIGINT", () => { unsubscribe(subscription); process.exit(0); });
}
```

### chokidar (alternative — pure JS, widely used)

```typescript
import chokidar from "chokidar";

const watcher = chokidar.watch("./spec/**/*.yaml", {
  ignoreInitial: true,
  usePolling: false,        // native events (faster)
  awaitWriteFinish: {       // wait for file to finish writing
    stabilityThreshold: 100,
    pollInterval: 50,
  },
});

watcher.on("change", (path) => scheduleRegeneration(() => generate(path)));
watcher.on("add", (path) => scheduleRegeneration(() => generate(path)));
```

---

## 2. Debouncing Strategy

A single file save triggers 3–5 filesystem events (write, close, rename on some editors).
Without debouncing, generation runs multiple times per save.

```typescript
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
const DEBOUNCE_MS = 200; // 100–300ms is the sweet spot

function scheduleRegeneration(generate: () => Promise<void>) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    console.log("[codegen] Regenerating...");
    const start = Date.now();
    try {
      await generate();
      console.log(`[codegen] Done in ${Date.now() - start}ms`);
    } catch (err) {
      console.error("[codegen] Generation failed:", err);
    }
  }, DEBOUNCE_MS);
}
```

**Tuning**:
- `100ms` — very responsive, may trigger during rapid saves
- `200ms` — good balance (GraphQL Code Generator default)
- `500ms` — conservative, good for slow machines or remote filesystems

---

## 3. Hash-Based Invalidation

Skip regeneration when inputs haven't changed. Hash inputs (not outputs) for stable cache keys.

```typescript
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function hashDirectory(dir: string, ext: string[]): string {
  const files = globSync(`${dir}/**/*.{${ext.join(",")}}`)
    .sort()
    .map(f => readFileSync(f));
  const hasher = createHash("sha256");
  files.forEach(f => hasher.update(f));
  return hasher.digest("hex");
}

// Use in watch loop
const cache = new Map<string, string>(); // path → hash

async function regenerateIfChanged(specPath: string) {
  const currentHash = hashFile(specPath);
  if (cache.get(specPath) === currentHash) {
    console.log(`[codegen] ${specPath} unchanged, skipping`);
    return;
  }

  await generate(specPath);
  cache.set(specPath, currentHash);
}
```

**Why hashes over timestamps**:
- Timestamps break when files are copied or checked out from git (all same mtime)
- Timestamps lie in CI environments and Docker layer caching
- Hashes are content-addressed — always correct

---

## 4. BuildInfo File (.codegen-info)

Persist invalidation state across process restarts (analogous to TypeScript's `.tsbuildinfo`).

```typescript
import { readFileSync, writeFileSync, existsSync } from "node:fs";

interface CodegenBuildInfo {
  version: string;                       // generator version (bump to invalidate all)
  inputs: Record<string, string>;        // absolute path → sha256
  outputs: Record<string, {
    hash: string;                        // sha256 of generated content
    sourceInput: string;                 // which input produced this output
  }>;
  reverse: Record<string, string[]>;     // input path → output paths
}

const BUILD_INFO_PATH = "./.codegen-info.json";

function readBuildInfo(): CodegenBuildInfo {
  if (!existsSync(BUILD_INFO_PATH)) {
    return { version: "1", inputs: {}, outputs: {}, reverse: {} };
  }
  return JSON.parse(readFileSync(BUILD_INFO_PATH, "utf-8"));
}

function writeBuildInfo(info: CodegenBuildInfo) {
  writeFileSync(BUILD_INFO_PATH, JSON.stringify(info, null, 2));
}

// On startup: check which outputs are stale
function findStaleOutputs(buildInfo: CodegenBuildInfo): string[] {
  const stale: string[] = [];
  for (const [inputPath, savedHash] of Object.entries(buildInfo.inputs)) {
    if (!existsSync(inputPath) || hashFile(inputPath) !== savedHash) {
      stale.push(...(buildInfo.reverse[inputPath] ?? []));
    }
  }
  return [...new Set(stale)];
}
```

**Add to `.gitignore`**: `.codegen-info.json` is a local build artifact.

---

## 5. Build Tool Integration

### Vite Plugin

```typescript
// vite-plugin-codegen.ts
import type { Plugin } from "vite";
import { generate } from "./codegen/config";

export function codegenPlugin(options: { watch: string[] }): Plugin {
  return {
    name: "vite-codegen",

    // Run generation before build starts
    async buildStart() {
      console.log("[codegen] Initial generation...");
      await generate();
    },

    // Handle file changes in watch mode
    async handleHotUpdate({ file, server }) {
      const isSpec = options.watch.some(pattern =>
        minimatch(file, pattern)
      );

      if (isSpec) {
        console.log(`[codegen] ${file} changed, regenerating...`);
        await generate(file);

        // Force TypeScript language server to reload
        server.ws.send({ type: "full-reload" });
      }
    },

    // Tell Vite to watch additional files beyond src/
    config() {
      return {
        server: {
          watch: {
            // Add spec directories to watch list
            paths: options.watch,
          }
        }
      };
    }
  };
}

// vite.config.ts usage:
// plugins: [codegenPlugin({ watch: ["./spec/**/*.yaml", "./proto/**/*.proto"] })]
```

### Rollup / esbuild Plugin

```typescript
// rollup-plugin-codegen.ts
import type { Plugin } from "rollup";

export function codegenPlugin(): Plugin {
  return {
    name: "rollup-codegen",
    async buildStart() {
      await generate();
      // Tell Rollup to watch spec files
      this.addWatchFile("./spec");
    },
    watchChange(id) {
      if (id.endsWith(".yaml") || id.endsWith(".proto")) {
        // Will trigger rebuild → buildStart → regeneration
      }
    }
  };
}
```

### webpack Plugin

```typescript
class CodegenWebpackPlugin {
  apply(compiler: Compiler) {
    compiler.hooks.beforeCompile.tapPromise("CodegenPlugin", async () => {
      await generate();
    });

    // Watch additional directories
    compiler.hooks.afterEnvironment.tap("CodegenPlugin", () => {
      compiler.watchFileSystem = wrapWithCodegenWatcher(compiler.watchFileSystem);
    });
  }
}
```

---

## 6. npm Scripts Pattern

Standard commands every project with code generation should have:

```json
{
  "scripts": {
    "codegen": "tsx codegen/config.ts",
    "codegen:watch": "tsx codegen/config.ts --watch",
    "codegen:check": "tsx codegen/config.ts && git diff --exit-code src/generated/",
    "predev": "pnpm codegen",
    "prebuild": "pnpm codegen"
  }
}
```

- `pnpm codegen` — one-shot generation
- `pnpm codegen:watch` — background generation during development
- `pnpm codegen:check` — CI validation (regenerate, assert no diff)
- `predev` / `prebuild` — ensure generation runs before dev/build

### CI Validation Pattern

Detect stale generated files in CI:

```yaml
# .github/workflows/ci.yml
- name: Check generated files are up-to-date
  run: |
    pnpm codegen
    git diff --exit-code src/generated/ || {
      echo "Generated files are stale. Run 'pnpm codegen' and commit the result."
      exit 1
    }
```

---

## 7. After Generation: Notifying the IDE

### Problem

After writing new files to `src/generated/`, the TypeScript Language Server may not pick up the
changes immediately, especially in large projects.

### Solutions

**Option 1: Touch tsconfig.json** (hacky but effective)

```typescript
import { utimesSync } from "node:fs";

async function generate() {
  await doGenerate();
  // Touch tsconfig to signal TS server to rescan
  const now = new Date();
  utimesSync("./tsconfig.json", now, now);
}
```

**Option 2: Use VS Code extension API** (if shipping a VS Code extension)

```typescript
// In your VS Code extension
import * as vscode from "vscode";

async function afterGeneration() {
  // Trigger TS server reload
  await vscode.commands.executeCommand("typescript.restartTsServer");
}
```

**Option 3: File System Events** (TS server watches `src/` and picks up changes automatically)

This is the default behavior when generating into `src/generated/` — the TypeScript Language
Server already watches the `src/` directory. No special action needed.

This is why generating into `src/generated/` (not `node_modules/`) is so important: the TS
language server watches `src/` but ignores `node_modules/`. Prisma had to implement a VS Code
extension hack to restart the TS server after `prisma generate` precisely because it generated
into `node_modules/` — a problem Prisma v7 eliminates by requiring explicit output paths.

### Format After Generation

Always run Prettier on generated output for readable, diffable files:

```typescript
import { format } from "prettier";
import { readFileSync, writeFileSync } from "node:fs";

async function formatGenerated(filePath: string) {
  const content = readFileSync(filePath, "utf-8");
  const formatted = await format(content, {
    parser: "typescript",
    ...prettierConfig,
  });
  writeFileSync(filePath, formatted);
}
```
