export function formatAmount(amount: number, currency: string): string {
  const n = amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return currency === "" ? n : `${n} ${currency}`;
}
