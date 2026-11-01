import { StreamFactoryBuilder } from "../StreamFactoryBuilder.js";
import { defaultState } from "./DeepReadonlyViewState.test-support.js";
import type { Added } from "./DeepReadonlyViewState.test-support.js";

// The assertions here are compile-time: an unused @ts-expect-error fails the type check.
const DeepReadonlyStreamFactory = new StreamFactoryBuilder("DeepReadonlyStream")
  .withEvent("Added")
  .asType<Added>()
  .withView("Mutating", defaultState, {
    Added: (s) => {
      // @ts-expect-error array mutation is not allowed
      s.items.push(1);
      // @ts-expect-error property assignment is not allowed
      s.count = 1;
      // @ts-expect-error nested property assignment is not allowed
      s.nested.flag = true;
      // @ts-expect-error Map mutation is not allowed
      s.tags.set("a", 1);
      return s;
    },
  })
  .withView(
    "Copying",
    defaultState,
    {
      Added: (s, e) => ({ ...s, items: [...s.items, e.value] }),
    },
    (snapshot) =>
      snapshot.onEvent((state) => {
        // @ts-expect-error predicate state is read-only
        state.items.push(1);
        return state.items.length > 0;
      }),
  )
  .build();

export default DeepReadonlyStreamFactory;
