# @eventualize/eslint-plugin

## 6.0.3

### Patch Changes

- be3fcc8: Update dependencies and cap peer ranges at the current major.

  - **Security:** Prisma moves to 7.10.1. `@prisma/adapter-mariadb` 7.10.1 uses `mariadb` 3.5.4, which fixes high-severity SQL injection, credential leak and memory exposure issues in `mariadb` 3.4.5. Users of `@eventualize/mysql-storage-adapter` should update.
  - Peer ranges now allow every newer minor and patch, but not the next major: `@opentelemetry/api` `^1.7.0`, `@aws-sdk/client-dynamodb` `^3.1111.0`, `eslint` `^9.0.0 || ^10.0.0`. No released version is excluded. See ADR 0004.
  - `@typescript-eslint/utils` moves to `^8.72.1`.

- 006831e: Add a README, description, keywords and homepage to each package, so the npm page shows docs.

## 6.0.2

### Patch Changes

- 4f98857: Fix "Cannot find module '@typescript-eslint/utils'" when the plugin is installed in another project. The rule imports `@typescript-eslint/utils` at runtime, but it was declared as a devDependency. It is now a regular dependency.

## 6.0.1

### Patch Changes

- 9634936: Fix "Cannot find module '@typescript-eslint/utils'" when the plugin is installed in another project. The rule imports `@typescript-eslint/utils` at runtime, but it was declared as a devDependency. It is now a regular dependency.

## 6.0.0

### Major Changes

- 48ab5e4: refine api / remove payload type

## 5.0.0

### Major Changes

- e062a12: api changes, add withMessages and metadata

## 4.4.0

### Minor Changes

- a02ab9b: fix import of PrismaClient

## 4.3.0

### Minor Changes

- 302c66c: fix: update PrismaClient imports

## 4.2.0

### Minor Changes

- da41352: lint builder factory
