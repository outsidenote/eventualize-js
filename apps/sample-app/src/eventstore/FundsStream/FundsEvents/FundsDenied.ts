import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

export class FundsDenied implements IEvDbEventPayload {
  readonly payloadType = "FundsDenied";
  constructor(public readonly amount: number, public readonly Currency: string, public readonly reason: string) {}
}
