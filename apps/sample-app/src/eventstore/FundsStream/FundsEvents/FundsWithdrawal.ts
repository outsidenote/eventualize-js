import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";


export type FundsWithdrawal = IEvDbEventPayload & { readonly payloadType: "FundsWithdrawal"; readonly amount: number; Currency: string; };
