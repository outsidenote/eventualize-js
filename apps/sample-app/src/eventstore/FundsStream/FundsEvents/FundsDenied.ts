import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";


export type FundsDenied = IEvDbEventPayload & { readonly payloadType: "FundsDenied"; readonly amount: number; Currency: string; reason: string; };
