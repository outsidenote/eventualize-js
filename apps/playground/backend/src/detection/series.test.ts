import { test, describe } from "node:test";
import * as assert from "node:assert";
import { readSeries } from "./series.js";
import { generate } from "../generator/generate.js";
import { NotFoundError } from "../errors.js";
import { seededRng } from "../tests/seededRng.js";
import InMemoryStorageAdapter from "../tests/InMemoryStorageAdapter.js";
import { replayBatch } from "../replay/replayBatch.js";

describe("readSeries", () => {
  test("points equal the replayed views at every offset", async () => {
    const s = new InMemoryStorageAdapter();
    await generate(s, "a", { count: 30, pattern: "random", storeEvery: 4 }, seededRng(11));
    const series = await readSeries(s, "a", 20_000);
    assert.strictEqual(series.points.length, 30);
    assert.strictEqual(series.lastOffset, 29);
    assert.strictEqual(series.truncated, false);
    const batch = await replayBatch(s, "a", { offset: 0, batchSize: 200, snapshots: false });
    assert.deepStrictEqual(
      series.points,
      batch.items.map((i) => ({
        offset: i.offset,
        balance: i.views.balance.amount,
        risk: i.views.risk,
      })),
    );
  });

  test("maxScan truncates", async () => {
    const s = new InMemoryStorageAdapter();
    await generate(s, "b", { count: 10, pattern: "riskCoolDown", storeEvery: 1 }, seededRng(12));
    const series = await readSeries(s, "b", 4);
    assert.deepStrictEqual(
      series.points.map((p) => p.offset),
      [0, 1, 2, 3],
    );
    assert.strictEqual(series.truncated, true);
  });

  test("unknown account", async () => {
    await assert.rejects(
      readSeries(new InMemoryStorageAdapter(), "none", 10),
      (e) => e instanceof NotFoundError,
    );
  });
});
