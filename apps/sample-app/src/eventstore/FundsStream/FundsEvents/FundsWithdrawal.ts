export const FundsWithdrawal = "FundsWithdrawal" as const;
export type FundsWithdrawal = { readonly eventType: typeof FundsWithdrawal; readonly amount: number; readonly Currency: string };
