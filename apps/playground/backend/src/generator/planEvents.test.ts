import { test, describe } from "node:test";
import * as assert from "node:assert";
import { assertReachable, isPattern, planStep, resolveGoal } from "./planEvents.js";
import { cents } from "../domain/money.js";
import { ValidationError } from "../errors.js";
import { seededRng } from "../tests/seededRng.js";

const inRange = (v: number, min: number, max: number) => v >= min && v <= max;

describe("planStep", () => {
  test("random: both kinds, values in the small or large band", () => {
    const rng = seededRng(1);
    const kinds = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const s = planStep({ pattern: "random", balance: 500, rng, remainingSteps: 300 - i });
      kinds.add(s.kind);
      assert.ok(inRange(s.value, 20, 1500) || inRange(s.value, 10_000, 40_000), String(s.value));
      assert.strictEqual(s.description, "random");
    }
    assert.deepStrictEqual([...kinds].sort(), ["deposit", "withdraw"]);
  });

  test("riskSpike: large deposits only", () => {
    const rng = seededRng(2);
    for (let i = 0; i < 50; i++) {
      const s = planStep({ pattern: "riskSpike", balance: 0, rng, remainingSteps: 1 });
      assert.strictEqual(s.kind, "deposit");
      assert.ok(inRange(s.value, 10_000, 40_000));
      assert.strictEqual(s.description, "risk spike");
    }
  });

  test("riskCoolDown: small deposits only", () => {
    const rng = seededRng(3);
    for (let i = 0; i < 50; i++) {
      const s = planStep({ pattern: "riskCoolDown", balance: 0, rng, remainingSteps: 1 });
      assert.strictEqual(s.kind, "deposit");
      assert.ok(inRange(s.value, 10, 200));
      assert.strictEqual(s.description, "risk cool-down");
    }
  });

  for (const [from, goal] of [
    [1000, 5000],
    [1000, 700],
    [0.3, 0.1],
    [123.45, 9999.99],
  ]) {
    test(`targetBalance ${from} → ${goal}: exact end, no overshoot, every step ≥ 0.01`, () => {
      const rng = seededRng(4);
      let balance = from;
      const count = 10;
      for (let i = 0; i < count; i++) {
        const s = planStep({
          pattern: "targetBalance",
          balance,
          rng,
          remainingSteps: count - i,
          goal,
        });
        assert.strictEqual(s.kind, goal > from ? "deposit" : "withdraw");
        assert.ok(s.value >= 0.01);
        balance = cents(balance + (s.kind === "deposit" ? s.value : -s.value));
        if (i < count - 1) {
          assert.ok(goal > from ? balance < goal : balance > goal, `overshoot at step ${i}`);
        }
      }
      assert.strictEqual(balance, goal);
    });
  }
});

describe("goal", () => {
  test("resolveGoal absolute and percent", () => {
    assert.strictEqual(resolveGoal(1000, { mode: "absolute", value: 5000 }), 5000);
    assert.strictEqual(resolveGoal(1000, { mode: "percent", value: -30 }), 700);
    assert.strictEqual(resolveGoal(1000, { mode: "percent", value: 25 }), 1250);
    assert.strictEqual(resolveGoal(0.3, { mode: "percent", value: -33.333 }), 0.2);
  });

  test("assertReachable rejects goal < 0, goal = balance, too-small steps", () => {
    const bad = (b: number, g: number, c: number) =>
      assert.throws(
        () => assertReachable(b, g, c),
        (e) => e instanceof ValidationError,
      );
    bad(100, -1, 1);
    bad(100, 100, 1);
    bad(1000, 1000.05, 10);
    assert.doesNotThrow(() => assertReachable(1000, 1000.1, 10));
  });

  test("assertReachable uses integer cents and rejects non-finite input", () => {
    assert.doesNotThrow(() => assertReachable(0, 0.07, 7));
    assert.throws(
      () => assertReachable(0, Number.NaN, 1),
      (e) => e instanceof ValidationError,
    );
    assert.throws(
      () => assertReachable(Number.NaN, 5, 1),
      (e) => e instanceof ValidationError,
    );
    assert.throws(
      () => assertReachable(0, Number.POSITIVE_INFINITY, 1),
      (e) => e instanceof ValidationError,
    );
  });

  test("planStep throws when the balance already equals the goal", () => {
    assert.throws(
      () =>
        planStep({
          pattern: "targetBalance",
          balance: 50,
          rng: seededRng(1),
          remainingSteps: 3,
          goal: 50,
        }),
      /target step invariant broken/,
    );
  });

  test("planStep throws when the gap cannot fit the remaining steps", () => {
    assert.throws(
      () =>
        planStep({
          pattern: "targetBalance",
          balance: 0,
          rng: seededRng(1),
          remainingSteps: 5,
          goal: 0.02,
        }),
      /target step invariant broken/,
    );
  });

  test("tight gap: 1000 to 1000.1 in 10 steps is ten exact 0.01 steps", () => {
    const rng = seededRng(11);
    let balance = 1000;
    for (let i = 0; i < 10; i++) {
      const s = planStep({
        pattern: "targetBalance",
        balance,
        rng,
        remainingSteps: 10 - i,
        goal: 1000.1,
      });
      assert.strictEqual(s.value, 0.01);
      balance = cents(balance + s.value);
    }
    assert.strictEqual(balance, 1000.1);
  });

  test("isPattern", () => {
    assert.ok(isPattern("random") && isPattern("targetBalance"));
    assert.ok(!isPattern("drain") && !isPattern(""));
  });
});
