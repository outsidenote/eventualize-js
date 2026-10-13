import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
// Stub for Node.js-only @asyncapi/parser — the UI uses the "without-parser"
// component path so the parser is never actually called at runtime, but its
// ESM imports still pull in Node built-ins (fs, util, stream, …).
const parserStub = resolve(__dirname, "src/asyncapi-parser-stub.js");
const NODE_ONLY_PACKAGES = [
    "@asyncapi/parser",
    "@asyncapi/openapi-schema-parser",
    "@asyncapi/avro-schema-parser",
    "@asyncapi/protobuf-schema-parser",
    "avsc",
    "node-fetch",
];
// Plugin that intercepts bare specifiers AND absolute filesystem paths that
// belong to stubbed packages, so Rollup never processes their Node.js deps.
function asyncapiParserStubPlugin() {
    return {
        name: "asyncapi-parser-stub",
        enforce: "pre",
        resolveId(id) {
            // Bare specifier (e.g. "@asyncapi/parser" or "@asyncapi/parser/cjs/document")
            for (const pkg of NODE_ONLY_PACKAGES) {
                if (id === pkg || id.startsWith(pkg + "/")) {
                    return parserStub;
                }
            }
            return undefined;
        },
        load(id) {
            // Absolute filesystem path that resolves inside a stubbed package
            for (const pkg of NODE_ONLY_PACKAGES) {
                if (id.includes(`/node_modules/${pkg}/`)) {
                    return `export default {}`;
                }
            }
            return undefined;
        },
    };
}
export default defineConfig({
    plugins: [react(), asyncapiParserStubPlugin()],
    root: ".",
    optimizeDeps: {
        exclude: NODE_ONLY_PACKAGES,
    },
    build: {
        outDir: "dist/ui",
        emptyOutDir: true,
        rollupOptions: {
            input: "index.html",
        },
    },
});
//# sourceMappingURL=vite.config.js.map