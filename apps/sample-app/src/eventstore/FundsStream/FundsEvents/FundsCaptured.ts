import type IEvDbEventType from "@eventualize/types/events/IEvDbEventType";

export class FundsCaptured implements IEvDbEventType {
  readonly eventType = "FundsCaptured";
  constructor(public readonly amount: number, public readonly Currency: string) {}
}
