export const FundsCaptured = "FundsCaptured" as const;
export type FundsCaptured = { readonly eventType: typeof FundsCaptured; readonly amount: number; readonly Currency: string };
