import { test, describe } from "node:test";
import * as assert from "node:assert";
import { detect, isDetectorKind } from "./detect.js";
import type { Detector, SeriesPoint } from "./detect.js";

const series = (risks: number[], balances?: number[]): SeriesPoint[] =>
  risks.map((risk, offset) => ({ offset, risk, balance: balances?.[offset] ?? 0 }));

describe("detect", () => {
  test("empty and one-point series never match", () => {
    const detectors: Detector[] = [
      { kind: "riskJump", jump: 1 },
      { kind: "riskRise", percent: 10, window: 1 },
      { kind: "balanceCrossUp", threshold: 0 },
    ];
    for (const d of detectors) {
      assert.deepStrictEqual(detect([], d), []);
      assert.deepStrictEqual(detect(series([5], [5]), d), []);
    }
  });

  test("riskJump: edge-triggered, offset 0 never matches", () => {
    // jumps at 1 (0→3), 2 (3→6) form one run; 3 (6→6) breaks it; 4 (6→9) starts a new run
    assert.deepStrictEqual(
      detect(series([0, 3, 6, 6, 9, 9.5]), { kind: "riskJump", jump: 2.5 }),
      [1, 4],
    );
  });

  test("riskJump catches drops too (absolute change)", () => {
    assert.deepStrictEqual(detect(series([9, 9, 4]), { kind: "riskJump", jump: 3 }), [2]);
  });

  test("riskRise: compares to window events earlier, uses RISK_FLOOR for 0", () => {
    // window 2: N=2: (2-0)/0.5=400% ≥ 100 ✓ ; N=3: (2-1)/1=100% ✓ (same run) ; N=4: (2-2)/2=0 ✗ ; N=5: (5-2)/2=150% ✓ new run
    const pts = series([0, 1, 2, 2, 2, 5]);
    assert.deepStrictEqual(detect(pts, { kind: "riskRise", percent: 100, window: 2 }), [2, 5]);
  });

  test("riskRise: no match before N = window", () => {
    assert.deepStrictEqual(
      detect(series([0, 10]), { kind: "riskRise", percent: 1, window: 2 }),
      [],
    );
  });

  test("riskDecline mirrors riskRise", () => {
    // window 1: N=1 (10→5) -50% ✓ ; N=2 (5→5) ✗ ; N=3 (5→1) -80% ✓
    assert.deepStrictEqual(
      detect(series([10, 5, 5, 1]), { kind: "riskDecline", percent: 50, window: 1 }),
      [1, 3],
    );
  });

  test("balanceCrossUp / Down at the exact threshold", () => {
    const pts = series([0, 0, 0, 0, 0], [99.99, 100, 150, 99.99, 100]);
    assert.deepStrictEqual(detect(pts, { kind: "balanceCrossUp", threshold: 100 }), [1, 4]);
    assert.deepStrictEqual(detect(pts, { kind: "balanceCrossDown", threshold: 100 }), [3]);
  });

  test("crossings are cents-safe", () => {
    const pts = series([0, 0], [0.1 + 0.2 - 0.01, 0.1 + 0.2]);
    assert.deepStrictEqual(detect(pts, { kind: "balanceCrossUp", threshold: 0.3 }), [1]);
  });

  test("isDetectorKind", () => {
    assert.ok(isDetectorKind("riskJump") && isDetectorKind("balanceCrossDown"));
    assert.ok(!isDetectorKind("riskSpike"));
  });
});
