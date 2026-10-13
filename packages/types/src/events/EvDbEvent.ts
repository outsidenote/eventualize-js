import type EvDbStreamCursor from "../stream/EvDbStreamCursor.js";
import type IEvDbEventMetadata from "./IEvDbEventMetadata.js";
import type { IEvDbPayloadData } from "./IEvDbPayloadData.js";
import { context, propagation } from "@opentelemetry/api";

export default class EvDbEvent implements IEvDbEventMetadata {
  constructor(
    public readonly eventType: string,
    public readonly streamCursor: EvDbStreamCursor,
    public readonly payload: IEvDbPayloadData,
    public readonly capturedAt: Date = new Date(Date.now()),
    public readonly capturedBy: string = "N/A",
    public readonly storedAt?: Date,
    public readonly traceparent?: string,
    public readonly tracestate?: string,
  ) {
    // If traceparent/tracestate not provided, capture from current span
    if (traceparent === undefined || tracestate === undefined) {
      const carrier: Record<string, string> = {};
      propagation.inject(context.active(), carrier);
      if (traceparent === undefined) {
        this.traceparent = carrier["traceparent"];
      }
      if (tracestate === undefined) {
        this.tracestate = carrier["tracestate"];
      }
    }
  }
}
