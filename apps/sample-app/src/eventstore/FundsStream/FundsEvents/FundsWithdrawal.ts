import type IEvDbEventType from "@eventualize/types/events/IEvDbEventType";

export class FundsWithdrawal implements IEvDbEventType {
  readonly eventType = "FundsWithdrawal";
  constructor(public readonly amount: number, public readonly Currency: string) {}
}
