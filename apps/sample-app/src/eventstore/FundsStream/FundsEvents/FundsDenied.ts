import type IEvDbEventType from "@eventualize/types/events/IEvDbEventType";

export class FundsDenied implements IEvDbEventType {
  readonly eventType = "FundsDenied";
  constructor(public readonly amount: number, public readonly Currency: string, public readonly reason: string) {}
}
