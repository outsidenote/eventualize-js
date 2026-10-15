import { test, describe } from "node:test";
import * as assert from "node:assert";
import { runDetection } from "./runDetection.js";
import type { Detector } from "./detect.js";
import { generate } from "../generator/generate.js";
import { seededRng } from "../tests/seededRng.js";
import InMemoryStorageAdapter from "../tests/InMemoryStorageAdapter.js";

describe("runDetection limits", () => {
  async function seeded(): Promise<InMemoryStorageAdapter> {
    const s = new InMemoryStorageAdapter();
    await generate(s, "a", { count: 30, pattern: "random", storeEvery: 4 }, seededRng(11));
    return s;
  }
  const detector: Detector = { kind: "riskJump", jump: 0.1 };

  test("maxMatches caps matches and flags truncated", async () => {
    const s = await seeded();
    const full = await runDetection(s, "a", detector, { maxScan: 20_000, maxMatches: 1000 });
    assert.ok(full.matches.length >= 2, `expected >= 2 matches, got ${full.matches.length}`);
    assert.strictEqual(full.truncated, false);
    const capped = await runDetection(s, "a", detector, { maxScan: 20_000, maxMatches: 1 });
    assert.strictEqual(capped.matches.length, 1);
    assert.strictEqual(capped.truncated, true);
  });

  test("maxScan caps scanned points and flags truncated", async () => {
    const s = await seeded();
    const r = await runDetection(s, "a", detector, { maxScan: 3, maxMatches: 1000 });
    assert.strictEqual(r.scanned, 3);
    assert.strictEqual(r.truncated, true);
  });
});
