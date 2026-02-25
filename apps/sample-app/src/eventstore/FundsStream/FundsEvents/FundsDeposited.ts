import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

export class FundsDeposited implements IEvDbEventPayload {
  readonly payloadType = "FundsDeposited";
  constructor(public readonly amount: number, public readonly Currency: string) {}
}
