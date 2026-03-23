export const FundsDeposited = "FundsDeposited" as const;
export type FundsDeposited = { readonly eventType: typeof FundsDeposited; readonly amount: number; readonly Currency: string };
