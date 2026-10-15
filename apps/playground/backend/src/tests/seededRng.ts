import type { Rng } from "../generator/planEvents.js";

/** Deterministic LCG in [0, 1) for reproducible generator tests. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
