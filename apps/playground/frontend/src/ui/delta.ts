import { cents } from "../money";

export type Delta = { readonly sign: 1 | -1 | 0; readonly abs: number };

/** Change versus the previous offset, in cents. No previous value means no change shown. */
export function deltaOf(current: number, previous: number | null): Delta {
  if (previous === null) return { sign: 0, abs: 0 };
  const d = cents(current - previous);
  return { sign: d > 0 ? 1 : d < 0 ? -1 : 0, abs: Math.abs(d) };
}
