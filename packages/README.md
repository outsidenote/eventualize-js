# Eventualize JS

A TypeScript event-sourcing library with multiple storage adapters.

## Packages

| Package | Description |
|---------|-------------|
| `@eventualize/types` | Shared type definitions |
| `@eventualize/core` | Core event-sourcing library |
| `@eventualize/relational-storage-adapter` | Base adapter for relational databases |
| `@eventualize/postgres-storage-adapter` | PostgreSQL storage adapter |
| `@eventualize/mysql-storage-adapter` | MySQL/MariaDB storage adapter |
| `@eventualize/dynamodb-storage-adapter` | DynamoDB storage adapter |

## Prerequisites

- Node.js (with native test runner support)
- npm
- Docker (for integration tests)

## Getting Started

```bash
# Install dependencies
npm install

# Build all packages
npm run build
```

## Running Tests

### Unit Tests

```bash
npm run test:unit
```

### Integration Tests

Integration tests require database services. You can run them using either **Docker Compose** (manual) or **Testcontainers** (automatic).

#### Option 1: Docker Compose

Start the local databases, run tests, then stop:

```bash
# Start databases (MySQL, PostgreSQL, DynamoDB Local)
docker compose up -d

# Run all integration tests
npm run test:integration

# Stop databases when done
npm run stop-local-dbs
```

Or use the combined command:

```bash
npm run test:integration:local
```

#### Option 2: Per-database Tests

Run integration tests against a specific database:

```bash
npm run test:mysql
npm run test:postgres
npm run test:dynamodb
```

### All Tests

Run both unit and integration tests:

```bash
npm test
```

## Environment Configuration

Copy `.env.example` to `.env` and adjust values as needed.

Default connection strings for local Docker services:

| Service    | URL                                                |
|------------|----------------------------------------------------|
| MySQL      | `mariadb://evdb:evdbpassword@localhost:3306/evdb_test` |
| PostgreSQL | `postgres://evdb:evdbpassword@localhost:5432/evdb_test` |
| DynamoDB   | `http://localhost:8000`                            |

## Build Commands

```bash
npm run build          # Build all packages
npm run clean          # Remove root build info
npm run clear          # Clean all workspaces
npm run rebuild        # Full clean + rebuild
```

## License

MIT
