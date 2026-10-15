/** Rounds to cents, the same rule the backend uses (domain/money.ts). */
export function cents(n: number): number {
  return Math.round(n * 100) / 100;
}
