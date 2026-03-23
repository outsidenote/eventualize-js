import type IEvDbEventMetadata from "./IEvDbEventMetadata.js";
import type IEvDbEventPayload from "./IEvDbEventPayload.js";

export default interface IEvDbEvent extends IEvDbEventMetadata {
  readonly payload: IEvDbEventPayload;
}
