import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import evdbPlugin from "@eventualize/eslint-plugin";

export default tseslint.config(
  {
    ignores: [
      "node_modules/",
      "**/dist/",
      "**/generated/",
      "**/*.d.ts",
      "**/*.js",
      "**/*.cjs",
      "**/*.mjs",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    plugins: {
      "@eventualize": evdbPlugin,
    },
    rules: {
      "@eventualize/enforce-stream-factory-module": "error",
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-empty-object-type": "off",
      "no-useless-assignment": "off",
      "preserve-caught-error": "off",
    },
  },
);
