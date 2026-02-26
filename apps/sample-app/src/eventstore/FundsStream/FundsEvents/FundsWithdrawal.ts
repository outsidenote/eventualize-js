import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

export class FundsWithdrawal implements IEvDbEventPayload {
  readonly payloadType = "FundsWithdrawal";
  constructor(public readonly amount: number, public readonly Currency: string) {}
}
