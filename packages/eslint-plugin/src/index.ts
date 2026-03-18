import { enforceStreamFactoryModule } from "./rules/enforce-stream-factory-module.js";

const plugin = {
  meta: {
    name: "@eventualize/eslint-plugin",
    version: "0.1.0",
  },
  rules: {
    "enforce-stream-factory-module": enforceStreamFactoryModule,
  },
};

export = plugin;
