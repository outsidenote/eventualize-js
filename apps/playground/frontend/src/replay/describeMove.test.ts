import { test } from "node:test";
import * as assert from "node:assert";
import { describeMove, directionOf } from "./describeMove";

test("describeMove covers every reason and source", () => {
  assert.strictEqual(
    describeMove({ target: 17, direction: 1, source: "cache", reason: "nav", pageSize: 20 }),
    "⚡ → 17 from cache",
  );
  assert.strictEqual(
    describeMove({
      target: 40,
      direction: 1,
      source: "server",
      reason: "nav",
      pageSize: 20,
      fetched: { start: 40, end: 59 },
    }),
    "🌐 → 40 fetched 40–59",
  );
  assert.strictEqual(
    describeMove({
      target: 3,
      direction: 0,
      source: "server",
      reason: "reload",
      pageSize: 20,
      fetched: { start: 3, end: 9 },
    }),
    "↻ 🌐 → 3 fetched 3–9",
  );
  assert.strictEqual(
    describeMove({
      target: 5,
      direction: 0,
      source: "server",
      reason: "pageSize",
      pageSize: 50,
      fetched: { start: 5, end: 54 },
    }),
    "♻ page size → 50 · 🌐 → 5 fetched 5–54",
  );
});

test("directionOf", () => {
  assert.strictEqual(directionOf(3, 9), 1);
  assert.strictEqual(directionOf(9, 3), -1);
  assert.strictEqual(directionOf(4, 4), 0);
});

test("describeMove for a match jump", () => {
  assert.strictEqual(
    describeMove({
      target: 40,
      direction: 1,
      source: "server",
      reason: "match",
      pageSize: 20,
      fetched: { start: 30, end: 49 },
    }),
    "🎯 match → 40 fetched 30–49",
  );
});
