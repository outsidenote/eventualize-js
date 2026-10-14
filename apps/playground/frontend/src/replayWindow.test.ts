import { test, describe } from "node:test";
import * as assert from "node:assert";
import { clampTarget, planMove } from "./replayWindow";

describe("planMove", () => {
  const win = { start: 20, end: 39 };

  test("inside the window is served from cache", () => {
    assert.deepStrictEqual(planMove(25, win, 100, 20), { kind: "cached", target: 25 });
    assert.deepStrictEqual(planMove(20, win, 100, 20), { kind: "cached", target: 20 });
    assert.deepStrictEqual(planMove(39, win, 100, 20), { kind: "cached", target: 39 });
  });

  test("forward past the end fetches from the target", () => {
    assert.deepStrictEqual(planMove(40, win, 100, 20), {
      kind: "fetch",
      target: 40,
      fetchOffset: 40,
    });
  });

  test("backward before the start fetches a window that ends on the target", () => {
    assert.deepStrictEqual(planMove(19, win, 100, 20), {
      kind: "fetch",
      target: 19,
      fetchOffset: 0,
    });
    assert.deepStrictEqual(planMove(5, { start: 30, end: 49 }, 100, 20), {
      kind: "fetch",
      target: 5,
      fetchOffset: 0,
    });
    assert.deepStrictEqual(planMove(29, { start: 30, end: 49 }, 100, 20), {
      kind: "fetch",
      target: 29,
      fetchOffset: 10,
    });
  });

  test("no window fetches from the target", () => {
    assert.deepStrictEqual(planMove(7, null, 100, 20), {
      kind: "fetch",
      target: 7,
      fetchOffset: 7,
    });
  });

  test("targets are clamped to 0..lastOffset", () => {
    assert.deepStrictEqual(planMove(-3, win, 100, 20), {
      kind: "fetch",
      target: 0,
      fetchOffset: 0,
    });
    assert.deepStrictEqual(planMove(500, { start: 90, end: 100 }, 100, 20), {
      kind: "cached",
      target: 100,
    });
  });

  test("clampTarget", () => {
    assert.strictEqual(clampTarget(-1, 10), 0);
    assert.strictEqual(clampTarget(11, 10), 10);
    assert.strictEqual(clampTarget(4, 10), 4);
    assert.strictEqual(clampTarget(4, -1), 0);
  });
});

test("planMove with page sizes 1, 7 and 200", () => {
  assert.deepStrictEqual(planMove(9, { start: 10, end: 10 }, 100, 1), {
    kind: "fetch",
    target: 9,
    fetchOffset: 9,
  });
  assert.deepStrictEqual(planMove(13, { start: 14, end: 20 }, 100, 7), {
    kind: "fetch",
    target: 13,
    fetchOffset: 7,
  });
  assert.deepStrictEqual(planMove(150, { start: 0, end: 199 }, 300, 200), {
    kind: "cached",
    target: 150,
  });
  assert.deepStrictEqual(planMove(250, { start: 0, end: 199 }, 300, 200), {
    kind: "fetch",
    target: 250,
    fetchOffset: 250,
  });
});
