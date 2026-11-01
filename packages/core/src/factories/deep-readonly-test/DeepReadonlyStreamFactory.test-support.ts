import { StreamFactoryBuilder } from "../StreamFactoryBuilder.js";
import { defaultState, richDefaultState } from "./DeepReadonlyViewState.test-support.js";
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
  .withView("RichMutating", richDefaultState, {
    Added: (s) => {
      // @ts-expect-error Set add is not allowed
      s.ids.add(1);
      // @ts-expect-error Set delete is not allowed
      s.ids.delete(1);
      // @ts-expect-error tuple element assignment is not allowed
      s.pair[1] = 2;
      // @ts-expect-error array inside an object cannot be pushed to
      s.meta.list.push(1);
      // @ts-expect-error array inside an array cannot be pushed to
      s.grid[0].push(1);
      // @ts-expect-error outer array element assignment is not allowed
      s.grid[0] = [];
      return s;
    },
  })
  .build();

export default DeepReadonlyStreamFactory;
