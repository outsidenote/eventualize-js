import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";


export type FundsRefunded = IEvDbEventPayload & { readonly payloadType: "FundsRefunded"; readonly amount: number; Currency: string; };
