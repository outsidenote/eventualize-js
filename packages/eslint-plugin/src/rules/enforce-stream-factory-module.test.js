"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const eslint_1 = require("eslint");
const enforce_stream_factory_module_js_1 = require("./enforce-stream-factory-module.js");
const tsParser = __importStar(require("@typescript-eslint/parser"));
const ruleTester = new eslint_1.RuleTester({
    languageOptions: {
        parser: tsParser,
        parserOptions: {
            ecmaVersion: 2020,
            sourceType: "module",
        },
    },
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
ruleTester.run("enforce-stream-factory-module", enforce_stream_factory_module_js_1.enforceStreamFactoryModule, {
    valid: [
        // FundsPureEventsStreamFactory pattern: events only, no views, with export type
        {
            filename: "FundsPureEventsStreamFactory.ts",
            code: `
        import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
        import type { FundsCaptured } from "./FundsEvents/FundsCaptured.js";
        import type { FundsDenied } from "./FundsEvents/FundsDenied.js";
        import type { FundsDeposited } from "./FundsEvents/FundsDeposited.js";

        const FundsPureEventsStreamFactory = new StreamFactoryBuilder("funds-stream")
          .withEvent("FundsCaptured").asType()
          .withEvent("FundsDenied").asType()
          .withEvent("FundsDeposited").asType()
          .build();

        export default FundsPureEventsStreamFactory;
        export type FundsPureEventsStreamType = typeof FundsPureEventsStreamFactory.StreamType;
      `,
        },
        // FundsEventsAndViewsStreamFactory pattern: withView with inline object literal + arrow functions
        {
            filename: "FundsEventsAndViewsStreamFactory.ts",
            code: `
        import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
        import type { FundsCaptured } from "./FundsEvents/FundsCaptured.js";
        import type { FundsDeposited } from "./FundsEvents/FundsDeposited.js";

        const FundsEventsAndViewsStreamFactory = new StreamFactoryBuilder("funds-stream")
          .withEvent("FundsCaptured").asType()
          .withEvent("FundsDeposited").asType()
          .withView("balance", 0, {
            FundsDeposited: (state, event) => state + event.amount,
            FundsCaptured: (state, event) => state - event.amount,
          })
          .build();

        export default FundsEventsAndViewsStreamFactory;
        export type FundsEventsAndViewsStreamType = typeof FundsEventsAndViewsStreamFactory.StreamType;
      `,
        },
        // PointsStreamFactory pattern: withView with external handler reference + multiple views
        {
            filename: "PointsStreamFactory.ts",
            code: `
        import type { PointsAdded } from "./PointsEvents/PointsAdded.js";
        import type { PointsSubtracted } from "./PointsEvents/PointsSubtracted.js";
        import type { PointsMultiplied } from "./PointsEvents/PointsMultiplied.js";
        import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
        import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
        import { sumViewHandlers } from "./PointsViews/SumViewHandlers.js";
        import { countViewHandlers } from "./PointsViews/CountViewHandlers.js";

        const PointsStreamFactory = new StreamFactoryBuilder("PointsStream")
          .withEvent("PointsAdded").asType()
          .withEvent("PointsSubtracted").asType()
          .withEvent("PointsMultiplied").asType()
          .withView("Sum", { sum: 0 }, sumViewHandlers)
          .withView("Count", { count: 0 }, countViewHandlers)
          .withMessages("PointsAdded", (payload, views, metadata) => [])
          .withMessages("PointsMultiplied", (payload, views, metadata) => [])
          .build();

        export default PointsStreamFactory;
        export type PointsStreamType = typeof PointsStreamFactory.StreamType;
      `,
        },
        // File without StreamFactoryBuilder import: rule does not trigger
        {
            filename: "SomeOtherFile.ts",
            code: `
        export function doSomething() { return 42; }
        const x = 5;
        interface IFoo { bar: string; }
        type Alias = string;
      `,
        },
        // Minimal factory: no export type (export type is optional)
        {
            filename: "MinimalFactory.ts",
            code: `
        import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
        import { MyEvent } from "./MyEvent.js";

        const MyFactory = new StreamFactoryBuilder("my-stream")
          .withEvent("MyEvent").asType()
          .build();

        export default MyFactory;
      `,
        },
        // Builder-only chain (no withEvent/withView calls) — just .build()
        {
            filename: "EmptyFactory.ts",
            code: `
        import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";

        const EmptyFactory = new StreamFactoryBuilder("empty").build();

        export default EmptyFactory;
      `,
        },
        // Chain with any intermediate methods — rule does not police method names
        {
            filename: "AnyMethodsFactory.ts",
            code: `
        import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
        import { MyEvent } from "./MyEvent.js";

        const AnyMethodsFactory = new StreamFactoryBuilder("x")
          .withEvent("MyEvent").asType()
          .withMessageFactories()
          .build();

        export default AnyMethodsFactory;
      `,
        },
        // Chain with arbitrary custom method — TypeScript enforces this, not ESLint
        {
            filename: "CustomMethodFactory.ts",
            code: `
        import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";

        const CustomMethodFactory = new StreamFactoryBuilder("x")
          .withCustomThing()
          .build();

        export default CustomMethodFactory;
      `,
        },
        // Generated file header comment: comments are not AST body nodes, must not trigger
        {
            filename: "GeneratedFactory.ts",
            code: `
        // @generated by evdb-codegen — do not edit manually
        // Source: FundsEvents
        import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
        import { FundsCaptured } from "./FundsEvents/FundsCaptured.js";

        const GeneratedFactory = new StreamFactoryBuilder("funds-stream")
          .withEvent("FundsCaptured").asType()
          .build();

        export default GeneratedFactory;
        export type GeneratedFactoryType = typeof GeneratedFactory.StreamType;
      `,
        },
    ],
    invalid: [
        // Function declaration at module level
        {
            filename: "BadFactory.ts",
            code: `
        import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
        const F = new StreamFactoryBuilder("x").build();
        export default F;
        function helper() { return 1; }
      `,
            errors: [{ messageId: "invalidStatement" }],
        },
        // Extra const variable (second const)
        {
            filename: "BadFactory.ts",
            code: `
        import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
        const F = new StreamFactoryBuilder("x").build();
        const extra = 5;
        export default F;
      `,
            errors: [{ messageId: "invalidStatement" }],
        },
        // Two StreamFactoryBuilder consts
        {
            filename: "BadFactory.ts",
            code: `
        import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
        const F1 = new StreamFactoryBuilder("x").build();
        const F2 = new StreamFactoryBuilder("y").build();
        export default F1;
      `,
            errors: [{ messageId: "multipleConsts" }],
        },
        // Chain doesn't end with .build()
        {
            filename: "BadFactory.ts",
            code: `
        import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
        const F = new StreamFactoryBuilder("x").withEvent("SomeEvent").asType();
        export default F;
      `,
            errors: [{ messageId: "invalidBuildChain" }, { messageId: "invalidExportDefault" }],
        },
        // export default of non-factory identifier
        {
            filename: "BadFactory.ts",
            code: `
        import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
        const F = new StreamFactoryBuilder("x").build();
        export default 42;
      `,
            errors: [{ messageId: "invalidExportDefault" }],
        },
        // export default of a different identifier than the factory
        {
            filename: "BadFactory.ts",
            code: `
        import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
        const F = new StreamFactoryBuilder("x").build();
        export default SomethingElse;
      `,
            errors: [{ messageId: "invalidExportDefault" }],
        },
        // Bare type alias declaration (not an export type)
        {
            filename: "BadFactory.ts",
            code: `
        import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
        const F = new StreamFactoryBuilder("x").build();
        type Alias = string;
        export default F;
      `,
            errors: [{ messageId: "invalidStatement" }],
        },
        // Interface declaration
        {
            filename: "BadFactory.ts",
            code: `
        import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
        const F = new StreamFactoryBuilder("x").build();
        interface IFoo { bar: string; }
        export default F;
      `,
            errors: [{ messageId: "invalidStatement" }],
        },
        // Value export (not type export)
        {
            filename: "BadFactory.ts",
            code: `
        import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
        const F = new StreamFactoryBuilder("x").build();
        export default F;
        export { F };
      `,
            errors: [{ messageId: "invalidStatement" }],
        },
        // export type of something other than typeof Factory.StreamType
        {
            filename: "BadFactory.ts",
            code: `
        import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
        const F = new StreamFactoryBuilder("x").build();
        export default F;
        export type WrongExport = string;
      `,
            errors: [{ messageId: "invalidStatement" }],
        },
        // Class declaration
        {
            filename: "BadFactory.ts",
            code: `
        import { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
        const F = new StreamFactoryBuilder("x").build();
        export default F;
        class Helper {}
      `,
            errors: [{ messageId: "invalidStatement" }],
        },
    ],
});
//# sourceMappingURL=enforce-stream-factory-module.test.js.map