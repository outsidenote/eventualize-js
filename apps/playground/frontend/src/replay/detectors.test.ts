import { test } from "node:test";
import * as assert from "node:assert";
import { buildDetectRequest, DETECTORS } from "./detectors";

test("DETECTORS lists the five kinds with their params", () => {
  assert.deepStrictEqual(
    DETECTORS.map((d) => [d.kind, d.params.map((p) => p.key)]),
    [
      ["riskJump", ["jump"]],
      ["riskRise", ["percent", "window"]],
      ["riskDecline", ["percent", "window"]],
      ["balanceCrossUp", ["threshold"]],
      ["balanceCrossDown", ["threshold"]],
    ],
  );
});

test("buildDetectRequest sends only the detector's params, as numbers", () => {
  assert.deepStrictEqual(
    buildDetectRequest("riskRise", { percent: "50", window: "5", jump: "9" }),
    {
      ok: true,
      request: { detector: "riskRise", params: { percent: 50, window: 5 } },
    },
  );
});

test("buildDetectRequest rejects empty or non-numeric input", () => {
  assert.deepStrictEqual(buildDetectRequest("balanceCrossUp", { threshold: "" }), {
    ok: false,
    error: "threshold must be a number",
  });
  assert.deepStrictEqual(buildDetectRequest("riskJump", { jump: "abc" }), {
    ok: false,
    error: "jump must be a number",
  });
});
