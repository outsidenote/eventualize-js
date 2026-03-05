import type { CountViewState } from "./CountViewState.js";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";

export function countViewHandler(
  oldState: CountViewState,
  _payload: unknown,
  meta: IEvDbEventMetadata,
): CountViewState {
  console.log(`Handling ${meta.eventType} event #${meta.streamCursor.offset}`);
  return { count: oldState.count + 1 };
}
