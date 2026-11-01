# @eventualize/eslint-plugin

ESLint rule for [eventualize-js](https://github.com/outsidenote/eventualize-js)
stream factory modules.

## Install

```bash
pnpm add -D @eventualize/eslint-plugin
```

Needs ESLint 9 or 10 (flat config). The peer range is `^9.0.0 || ^10.0.0`. It
depends on `@typescript-eslint/utils`, which today supports TypeScript below 6.1
and ESLint up to 10.

## Setup

```js
// eslint.config.js
import eventualize from "@eventualize/eslint-plugin";

export default [
  {
    plugins: { "@eventualize": eventualize },
    rules: { "@eventualize/enforce-stream-factory-module": "error" },
  },
];
```

## Rule: `enforce-stream-factory-module`

Checks every file that imports `StreamFactoryBuilder`. Such a file may hold only:

1. imports,
2. one `const XFactory = new StreamFactoryBuilder(...)...build();`,
3. `export default XFactory;`,
4. optionally `export type XStreamType = typeof XFactory.StreamType;`.

Put event types and view handlers in their own files.

```ts
// ✅ PointsStreamFactory.ts
import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { PointsAdded } from "./PointsEvents/PointsAdded.js";
import { sumViewHandlers } from "./PointsViews/SumViewHandlers.js";

const PointsStreamFactory = new StreamFactoryBuilder("PointsStream")
  .withEvent("PointsAdded")
  .asType<PointsAdded>()
  .withView("Sum", { sum: 0 }, sumViewHandlers)
  .build();

export default PointsStreamFactory;
export type PointsStreamType = typeof PointsStreamFactory.StreamType;
```

| Message id | Reported when |
|------------|---------------|
| `invalidStatement` | Any other statement, for example a helper function or another export |
| `multipleConsts` | A second factory `const` |
| `invalidExportDefault` | The default export is not the factory |
| `invalidBuildChain` | The builder chain does not end with `.build()` |

## License

MIT
