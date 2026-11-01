# Immutable view state

View handlers must return a new state. They must never change the old state in
place. This guide explains why, and how to set up a project so that the
compiler and the linter catch most mistakes. It ends with a block to paste into
your project's `AGENTS.md` or `CLAUDE.md`.

## Why it matters

A view decides on each `store()` whether to write a full snapshot row or a
small pointer row (see [Snapshots](snapshots.md#what-store-writes)). It must
know whether the state changed. The `changeDetection` setting chooses how:

- **`"always"` (default).** Any event with a handler counts as a change. A
  handler that changes the state in place still gives a correct snapshot. In
  this mode, mutation is a code smell, not a snapshot bug.
- **`"trusted"`.** An event counts as a change only when the handler returns a
  new object (`next !== prev`). A handler that changes the state in place and
  returns the same object is missed. The view writes a pointer row, and the
  stored snapshot is silently stale. A later load returns the wrong state.

So mutation breaks snapshot correctness **only in `"trusted"` mode**. Use that
mode only with the setup below.

One case is wrong in every mode: code outside a handler that changes
`view.state`. That change has no event behind it, so the next load cannot
rebuild it.

## What the types give you

`view.state`, the `state` argument of each handler, and the `state` argument
of snapshot predicates are `DeepReadonly<TState>`. Handlers return
`DeepReadonly<TState>`. The type is in `@eventualize/types/view/DeepReadonly`.

These fail to compile:

```ts
state.count = 1;          // TS2540: read-only property
state.items.push(x);      // TS2339: 'push' does not exist on readonly string[]
state.tags.set("a", 1);   // TS2339: 'set' does not exist on ReadonlyMap
const a: string[] = state.items; // TS4104: readonly array to mutable type
```

Write handlers like this:

```ts
.withView("Cart", { items: [] as string[], total: 0 }, {
  ItemAdded: (state, e) => ({ ...state, items: [...state.items, e.sku], total: state.total + e.price }),
})
```

This is compile-time only. Nothing is frozen at runtime.

## Safe project setup

### `tsconfig.json`

```jsonc
{
  "compilerOptions": {
    "strict": true
  }
}
```

### ESLint

Install `typescript-eslint` and `eslint-plugin-functional`. Then, in
`eslint.config.js`:

```js
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import functional from "eslint-plugin-functional";

export default defineConfig(
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true } },
    // eslint-disable comments are ignored, so a rule cannot be turned off in place.
    linterOptions: { noInlineConfig: true },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
    },
  },
  {
    // The files that hold view handlers. Adjust the globs to your layout.
    files: ["src/**/*StreamFactory.ts", "src/**/views/**/*.ts"],
    plugins: { functional },
    rules: {
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      "functional/immutable-data": "error",
    },
  },
);
```

- `no-explicit-any` and the `no-unsafe-*` rules stop `any` from removing the
  read-only types.
- `consistent-type-assertions` with `assertionStyle: "never"` stops casts such
  as `(state as State).count = 1` in handler files.
- `functional/immutable-data` reports assignments to properties and calls such
  as `push` and `Object.assign`, even when the type is mutable.
- `noInlineConfig: true` makes `// eslint-disable` comments do nothing.

Run the linter in CI. A rule that only runs in the editor protects nothing.

## Holes that remain

Even with this setup, some mutations get past the checks:

| Hole | Example | Caught by |
| --- | --- | --- |
| A read-only object is assignable to a mutable object type | `const m: { a: number } = state.nested; m.a = 2;` | `functional/immutable-data` (not TypeScript) |
| Casts | `(state as State).count = 1` | `consistent-type-assertions` in the listed files only |
| `any` | `(state as any).count = 1`, `JSON.parse` results | `no-explicit-any`, `no-unsafe-*` |
| `Date` and class instances keep their methods | `state.at.setTime(0)` | nothing |
| Third-party functions that mutate | `_.set(state, "a", 2)` | nothing |
| JavaScript callers | any `.js` file | nothing |
| An event payload object stored in state | `(s, e) => ({ ...s, last: e })`, then the caller changes the object it passed to `appendEvent` | nothing |
| Code outside the linted files | a helper in `src/utils` that mutates its argument | only if its folder is in the `files` globs |

Arrays, `Map` and `Set` get real protection: a read-only array or map cannot be
assigned to a mutable one.

In `"always"` mode these holes do not affect snapshot correctness. In
`"trusted"` mode each one can produce a stale snapshot.

## Best practices

- Return a new object with spread: `({ ...state, total: state.total + e.amount })`.
- Copy arrays: `[...state.items, x]`, `state.items.filter((i) => i !== x)`.
- Never store an event payload object in state as is. Copy the fields you need:
  `({ ...state, last: { ...e } })`.
- Keep state JSON-like: plain objects, arrays, strings, numbers, booleans and
  `null`. No `Map`, `Set`, `Date` or class instances. They do not survive the
  JSON round trip of a snapshot anyway.
- Never change `view.state` outside a handler.
- Keep the default `"always"` mode unless full rows cost too much and the
  project has the setup above.
- A handler that does not change the state may return `state` as is. In
  `"trusted"` mode this is what skips the full row.

## Block for your `AGENTS.md` / `CLAUDE.md`

Paste this into the instructions file of a project that uses eventualize-js:

```markdown
## eventualize-js view handlers

- A view handler is a pure function. It returns a new state. It never changes
  `state`, the event payload, or `view.state`.
- Return new objects with spread. Build new arrays: `[...state.items, x]`.
- Never store an event payload object in state as is. Copy its fields.
- Keep view state JSON-like: no `Map`, `Set`, `Date` or class instances.
- If a handler does not change the state, return `state` unchanged.
- Never use `any`, `as` casts, `@ts-ignore`, `@ts-expect-error` or
  `eslint-disable` in handler code. If the types block you, change the code,
  not the checks.
- Do not use mutating helpers (`Object.assign` on state, `_.set`, `push`,
  `splice`, `sort` in place) on state.
- Do not switch a view to `changeDetection("trusted")` unless a human asked
  for it. The default `"always"` is safe.
- Every snapshot strategy needs an `offsetGap(n)` guard rail, unless it fires
  on every event type that changes the state.
```

See [ADR 0005](../adr/0005-snapshot-pointer-rows.md) for the reasons behind the
modes.
