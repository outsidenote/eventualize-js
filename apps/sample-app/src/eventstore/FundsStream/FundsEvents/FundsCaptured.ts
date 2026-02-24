import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";


export type FundsCaptured = IEvDbEventPayload & { readonly payloadType: "FundsCaptured"; readonly amount: number; Currency: string; };
