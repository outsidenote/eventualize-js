---
"@eventualize/types": major
"@eventualize/core": major
---

Breaking: view state is typed read-only all the way down (`DeepReadonly<TState>`).

- View handlers receive `oldState: DeepReadonly<TState>` and return `DeepReadonly<TState>`. A handler that mutates its input, such as `state.items.push(x)` or `state.set(k, v)`, no longer compiles. Return a new object or a copied array or `Map` instead.
- `view.state` and the `state` argument of snapshot `onEvent` predicates are `DeepReadonly<TState>`.
- Compile-time only. Nothing is frozen at runtime. TypeScript does not check `readonly` on assignment, so arrays, `Map` and `Set` are the real protection.
- New type: `@eventualize/types/view/DeepReadonly`.
