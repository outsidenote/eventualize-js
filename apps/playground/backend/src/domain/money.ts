/** Rounds to cents. Use for every money comparison: view balances accumulate float noise. */
export function cents(n: number): number {
  return Math.round(n * 100) / 100;
}
