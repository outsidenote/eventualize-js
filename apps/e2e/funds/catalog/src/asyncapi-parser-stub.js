// Stub for @asyncapi/parser and related schema-parser packages.
// The UI renders already-parsed AsyncAPI specs via the "without-parser"
// Standalone component so none of these run at runtime.  We export every
// named symbol imported by @asyncapi/react-component helpers so Rollup
// does not complain about missing named exports.

const noop = () => undefined;
const noopClass = class {};

// @asyncapi/parser — document helpers
export const isAsyncAPIDocument = noop;
export const isOldAsyncAPIDocument = noop;
export const toAsyncAPIDocument = noop;
export const createAsyncAPIDocument = noop;
export const unstringify = noop;
export const stringify = noop;
export const isStringifiedDocument = noop;

// @asyncapi/parser — model classes used in helpers/schema.js
export const SchemaV2 = noopClass;

// @asyncapi/parser — Parser class and URL loader
export const Parser = noopClass;
export const fromURL = noop;
export const fromFile = noop;

// schema parsers
export const OpenAPISchemaParser = () => ({});
export const AvroSchemaParser = () => ({});
export const ProtoBuffSchemaParser = () => ({});

export default {};
