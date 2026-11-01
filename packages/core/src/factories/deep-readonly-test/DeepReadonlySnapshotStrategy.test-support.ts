import { createSnapshotStrategy } from "../../view/EvDbSnapshotStrategyBuilder.js";
import type { Added, RichViewState } from "./DeepReadonlyViewState.test-support.js";

// The assertions here are compile-time: an unused @ts-expect-error fails the type check.
// Strategy predicates receive a read-only state: the typed rule, the any-event rule and matchesEvent.
export const richStrategy = createSnapshotStrategy<RichViewState, { Added: Added }>((snapshot) =>
  snapshot
    .onEvent("Added", (state) => {
      // @ts-expect-error typed event rule: Set add is not allowed
      state.ids.add(1);
      return true;
    })
    .onEvent((state) => {
      // @ts-expect-error any-event rule: nested array push is not allowed
      state.meta.list.push(1);
      return true;
    }),
);

export function matchesEventState(state: Parameters<typeof richStrategy.matchesEvent>[0]): void {
  // @ts-expect-error matchesEvent state is read-only
  state.meta.list.push(1);
}
