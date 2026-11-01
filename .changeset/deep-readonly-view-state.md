---
"@eventualize/types": major
"@eventualize/core": major
---

Breaking: view state is typed read-only all the way down (`DeepReadonly<TState>`).

- View handlers receive `oldState: DeepReadonly<TState>` and return `DeepReadonly<TState>`. A handler that mutates its input, such as `state.items.push(x)` or `state.set(k, v)`, no longer compiles. Return a new object or a copied array or `Map` instead.
- `view.state` and the `state` argument of snapshot `onEvent` predicates are `DeepReadonly<TState>`.
- Compile-time only. Nothing is frozen at runtime. TypeScript rejects `state.count = 1`, but a read-only object is still assignable to a mutable object type (`const m: { count: number } = state; m.count = 1` compiles), and casts and `any` get past the types. Read-only arrays, `Map` and `Set` cannot be assigned to mutable ones, so they get the strongest protection. See the Immutable view state guide.
- New type: `@eventualize/types/view/DeepReadonly`.
