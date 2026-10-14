---
"@eventualize/eslint-plugin": patch
---

Fix "Cannot find module '@typescript-eslint/utils'" when the plugin is installed in another project. The rule imports `@typescript-eslint/utils` at runtime, but it was declared as a devDependency. It is now a regular dependency.
