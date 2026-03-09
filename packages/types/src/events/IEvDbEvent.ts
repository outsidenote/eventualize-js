import type IEvDbEventMetadata from "./IEvDbEventMetadata";

export default interface IEvDbEvent extends IEvDbEventMetadata {
  readonly payload: unknown;
}
