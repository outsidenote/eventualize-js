#!/usr/bin/env node
/**
 * Finds all *StreamSpec.ts files in the repo and regenerates their
 * sibling *StreamFactory.ts files via evdb-codegen.
 *
 * Invoked by:
 *   npm run generate:all-stream-factories   (manual / prebuild)
 *   npm run generate:watch                  (dev watch mode — tsx reruns this on file changes)
 */

import { globSync } from "node:fs";
import { generateFromSpec } from "./generateStreamFactory.js";

const specFiles = globSync("apps/**/src/**/*StreamSpec.ts", {
  cwd: process.cwd(),
  exclude: (f: string) => f.includes("node_modules") || f.includes("dist"),
});

if (specFiles.length === 0) {
  console.log("No *StreamSpec.ts files found.");
} else {
  for (const file of specFiles) {
    generateFromSpec(file);
  }
}
