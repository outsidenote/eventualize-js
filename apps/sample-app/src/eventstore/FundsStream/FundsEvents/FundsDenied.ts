export const FundsDenied = "FundsDenied" as const;
export type FundsDenied = { readonly eventType: typeof FundsDenied; readonly amount: number; readonly Currency: string; readonly reason: string };
