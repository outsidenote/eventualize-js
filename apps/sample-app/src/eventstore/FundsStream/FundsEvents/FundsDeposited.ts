import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

export type FundsDeposited = IEvDbEventPayload & { readonly payloadType: "FundsDeposited"; readonly amount: number, Currency: string };
