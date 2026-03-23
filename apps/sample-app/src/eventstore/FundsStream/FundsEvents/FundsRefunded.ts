export const FundsRefunded = "FundsRefunded" as const;
export type FundsRefunded = { readonly eventType: typeof FundsRefunded; readonly amount: number; readonly Currency: string };
