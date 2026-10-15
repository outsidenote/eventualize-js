import type { CommandIntent } from "../commands/commands.js";
import { cents } from "../domain/money.js";
import { ValidationError } from "../errors.js";

export type Pattern = "random" | "riskSpike" | "riskCoolDown" | "targetBalance";
export type Target = { readonly mode: "absolute" | "percent"; readonly value: number };
/** Returns a number in [0, 1). Injected so tests are deterministic. */
export type Rng = () => number;

const MIN_STEP = 0.01;
const JITTER = 0.3;

export function isPattern(v: string): v is Pattern {
  return v === "random" || v === "riskSpike" || v === "riskCoolDown" || v === "targetBalance";
}

const between = (rng: Rng, min: number, max: number): number => cents(min + rng() * (max - min));

export function resolveGoal(balance: number, target: Target): number {
  return cents(target.mode === "absolute" ? target.value : balance * (1 + target.value / 100));
}

export function assertReachable(balance: number, goal: number, count: number): void {
  if (!Number.isFinite(balance) || !Number.isFinite(goal)) {
    throw new ValidationError("balance and target must be finite numbers");
  }
  const gap = cents(goal - cents(balance));
  if (goal < 0) throw new ValidationError(`target balance ${goal} is below 0`);
  if (gap === 0) throw new ValidationError(`balance is already ${goal}`);
  if (Math.round(Math.abs(gap) * 100) < count) {
    throw new ValidationError(`gap ${gap} is too small for ${count} steps (min ${MIN_STEP} each)`);
  }
}

/**
 * One target-balance step: an even share of the remaining gap with ±30% jitter, clamped so
 * every later step still gets at least MIN_STEP and the gap never changes sign. The last
 * step is the exact remaining gap.
 */
function targetStep(
  balance: number,
  goal: number,
  rng: Rng,
  remainingSteps: number,
): CommandIntent {
  const gap = cents(goal - cents(balance));
  const kind = gap > 0 ? "deposit" : "withdraw";
  const abs = Math.abs(gap);
  if (abs === 0) throw new Error("target step invariant broken: gap is 0");
  let value = abs;
  if (remainingSteps > 1) {
    const share = (abs / remainingSteps) * (1 + (rng() * 2 - 1) * JITTER);
    const max = cents(abs - MIN_STEP * (remainingSteps - 1));
    if (max < MIN_STEP) {
      throw new Error(
        `target step invariant broken: gap ${abs} too small for ${remainingSteps} steps`,
      );
    }
    value = Math.min(max, Math.max(MIN_STEP, cents(share)));
  }
  return { kind, value, description: "target balance" };
}

export function planStep(input: {
  readonly pattern: Pattern;
  readonly balance: number;
  readonly rng: Rng;
  readonly remainingSteps: number;
  readonly goal?: number;
}): CommandIntent {
  const { pattern, balance, rng, remainingSteps, goal } = input;
  switch (pattern) {
    case "riskSpike":
      return { kind: "deposit", value: between(rng, 10_000, 40_000), description: "risk spike" };
    case "riskCoolDown":
      return { kind: "deposit", value: between(rng, 10, 200), description: "risk cool-down" };
    case "targetBalance":
      if (goal === undefined) throw new ValidationError("target is required for targetBalance");
      return targetStep(balance, goal, rng, remainingSteps);
    case "random": {
      const kind = rng() < 0.5 ? "deposit" : "withdraw";
      const value = rng() < 0.1 ? between(rng, 10_000, 40_000) : between(rng, 20, 1500);
      return { kind, value, description: "random" };
    }
  }
}
