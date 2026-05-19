# PRD: apps/e2e/funds — Funds E2E Demo App

**Date:** 2026-05-19  
**Branch:** otel-2026-05-19  
**Status:** Approved for implementation

---

## 1. Purpose

`apps/e2e/funds` is a self-contained end-to-end demo application inside the `eventualize-js` monorepo. It demonstrates the full eventualize ecosystem: event-sourced stream → outbox → CDC → Kafka → independent read model consumers, with OpenTelemetry observability throughout.

The app models a funds domain: accounts can deposit and withdraw funds. Every transaction flows through the outbox pattern (CDC via Debezium) into Kafka, where two independent consumer processes maintain their own read models.

---

## 2. Scope

### In scope

- New `apps/e2e/funds` workspace package
- New stream factory: `FundsStream` with two domain events, two in-stream views, and one outbox message
- Two REST endpoints: deposit and withdraw
- Two independent consumer slice processes (leaderboard + risk), each with its own transport binding and data layer
- OpenTelemetry instrumentation on all layers
- Docker Compose stack: Postgres, Kafka (KRaft), Debezium Connect, MongoDB
- Infrastructure SQL and Debezium connector config

### Out of scope

- Authentication / authorisation
- Multi-currency conversion
- Production-grade retry/DLQ configuration
- UI

---

## 3. Architecture

### 3.1 Data Flow

```
HTTP POST /api/funds/deposit | /api/funds/withdraw
    │
    ▼
CommandHandlerOrchestrator
    fetch stream → appendEvent → store()
    │
    ▼
Postgres
  ├── evdb_events table      (stream events)
  └── evdb_outbox table      (FundsChanged messages)
              │
              └──► Debezium CDC ──► Kafka topic: events.FundsChanged
                                           │
                         ┌─────────────────┴─────────────────┐
                         │                                   │
               consumer group:                    consumer group:
               "leaderboard.FundsChanged"          "risk.FundsChanged"
               server.ts                           risk-server.ts
                         │                                   │
                         ▼                                   ▼
               pg.Pool                             MongoClient
               account_leaderboard table           account_risk collection
               (plain SQL UPSERT)                  (rolling 10-tx window + risk level)
```

### 3.2 Two Processes

| Process | Entry point | Kafka consumer group | Data store |
|---------|-------------|----------------------|------------|
| Main server | `src/server.ts` | `leaderboard.FundsChanged` | Postgres (`account_leaderboard`) |
| Risk server | `src/risk-server.ts` | `risk.FundsChanged` | MongoDB (`account_risk`) |

Each process is fully independent. Neither touches the other's data store.

---

## 4. Stream Factory

**Location:** `src/BusinessCapabilities/Funds/swimlanes/Funds/index.ts`  
**Stream type:** `"funds-stream"`

### 4.1 Events

| Event | Payload |
|-------|---------|
| `FundsDeposited` | `{ accountId: string, amount: number, currency: string }` |
| `FundsWithdrawn` | `{ accountId: string, amount: number, currency: string }` |

### 4.2 Views (in-stream, replayed on load)

**`balance`** — running number.  
- `FundsDeposited`: `state + amount`  
- `FundsWithdrawn`: `state - amount`

### 4.3 Outbox Message: `FundsChanged`

Produced on every event. Carries everything both downstream consumers need.

```ts
{
  accountId: string,
  currentBalance: number,
  delta: number,          // positive = deposit, negative = withdrawal
  currency: string,
  transactionId: string   // stream offset used as idempotency key
}
```

---

## 5. Slice Architecture

Each slice is a self-contained unit: **command** (payload shape) + **commandHandler** (pure DB write function) + **adapter** (injects the DB client) + one or more **transport bindings** (kafka/, http/). The transport never leaks into the command handler.

### 5.1 DepositFunds (stream slice)

- `command.ts` — `DepositFunds { accountId, amount, currency }`
- `commandHandler.ts` — `stream.appendEventFundsDeposited(...)`
- `adapter.ts` — `CommandHandlerOrchestratorFactory.create(storageAdapter, FundsStreamFactory, ...)`
- `http/index.ts` — Express handler `POST /api/funds/deposit`

### 5.2 WithdrawFunds (stream slice)

- `command.ts` — `WithdrawFunds { accountId, amount, currency }`
- `commandHandler.ts` — checks balance view; appends `FundsWithdrawn` or rejects if insufficient
- `adapter.ts` — same orchestration pattern
- `http/index.ts` — Express handler `POST /api/funds/withdraw`

### 5.3 AccountLeaderboard (read model slice)

- `command.ts` — `UpdateAccountLeaderboard { accountId, delta, currentBalance, currency, transactionId }`
- `commandHandler.ts` — SQL UPSERT into `account_leaderboard` via injected `pg.Pool`
- `adapter.ts` — injects `pg.Pool`
- `kafka/index.ts` — plain `launchKafkaConsumer` wrapper: maps `FundsChanged` → `UpdateAccountLeaderboard` → adapter. (`defineAutomationEndpoint` is not used here — it is coupled to `IEvDbStorageAdapter` and is only suitable for stream command slices.)
- `http/index.ts` — `POST /api/funds/leaderboard/update` (same adapter, HTTP transport)

### 5.4 RiskAssessment (read model slice)

- `command.ts` — `UpdateAccountRisk { accountId, delta, currentBalance, currency, transactionId }`
- `commandHandler.ts` — MongoDB: push delta into rolling 10-entry array, compute `riskLevel`, upsert document
- `adapter.ts` — injects `MongoClient`
- `kafka/index.ts` — plain `launchKafkaConsumer` wrapper: maps `FundsChanged` → `UpdateAccountRisk` → adapter
- `http/index.ts` — `POST /api/risk/update` (same adapter, HTTP transport)

---

## 6. Risk Scoring Algorithm

Computed inside `RiskAssessment/commandHandler.ts` after updating the rolling window.

```
rollingWindow = last 10 deltas (most recent first)
avgDelta = sum(rollingWindow) / len(rollingWindow)

if len(rollingWindow) < 10:
  riskLevel = "none"          // insufficient data
else if avgDelta >= 0:
  riskLevel = "low"           // net positive trend
else:
  stepsToZero = currentBalance / abs(avgDelta)
  if stepsToZero > 20:  riskLevel = "low"
  if stepsToZero > 10:  riskLevel = "medium"
  if stepsToZero > 5:   riskLevel = "high"
  else:                 riskLevel = "high"  // imminent
```

MongoDB document shape per account:
```ts
{
  accountId: string,
  transactions: Array<{ delta: number, transactionId: string, recordedAt: Date }>,  // max 10
  riskLevel: "none" | "low" | "medium" | "high",
  currentBalance: number,
  assessedAt: Date
}
```

---

## 7. AccountLeaderboard Schema

```sql
CREATE TABLE account_leaderboard (
  account_id      TEXT PRIMARY KEY,
  currency        TEXT NOT NULL,
  total_deposited NUMERIC NOT NULL DEFAULT 0,
  total_withdrawn NUMERIC NOT NULL DEFAULT 0,
  last_balance    NUMERIC NOT NULL DEFAULT 0,
  deposit_count   INTEGER NOT NULL DEFAULT 0,
  withdrawal_count INTEGER NOT NULL DEFAULT 0,
  last_activity   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

UPSERT on every `FundsChanged` message. Ordered by `last_balance DESC` for leaderboard queries.

---

## 8. Infrastructure

### 8.1 Docker Compose Services

| Service | Image | Purpose |
|---------|-------|---------|
| `postgres` | `postgres:16` | EvDb event store + leaderboard table |
| `kafka` | `confluentinc/cp-kafka` (KRaft mode, no Zookeeper) | Message broker |
| `debezium` | `debezium/connect:2.7` | CDC: outbox → Kafka |
| `mongodb` | `mongo:7` | Risk assessment storage |

### 8.2 Debezium Connector

Outbox event router connector watching `evdb_outbox`. Routes by `message_type` field into topic `events.{message_type}` (e.g. `events.FundsChanged`).

### 8.3 init.sql

- Create `account_leaderboard` table
- Create the outbox trigger that inserts pg-boss jobs transactionally (copied from blueprint pattern)

---

## 9. OpenTelemetry

Both processes initialise `@opentelemetry/sdk-node` at startup before any other imports.

| Layer | Span |
|-------|------|
| EvDb `stream.get` | `eventualize.stream.get` (automatic, existing) |
| EvDb `appendEvent` | `eventualize.stream.append` (automatic, existing) |
| EvDb `store()` | `eventualize.stream.store` (automatic, existing) |
| Kafka consumer `onMessage` | `funds.consumer.leaderboard` / `funds.consumer.risk` |
| Command handler | `funds.command.updateLeaderboard` / `funds.command.updateRisk` |

Traceparent from the outbox message (`FundsChanged.traceparent`) is extracted in the Kafka consumer span to maintain the distributed trace across the CDC boundary.

---

## 10. API Endpoints

### Main server (`server.ts`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/funds/deposit` | Deposit funds into an account |
| `POST` | `/api/funds/withdraw` | Withdraw funds from an account |
| `POST` | `/api/funds/leaderboard/update` | HTTP transport for leaderboard command |
| `GET` | `/api/funds/leaderboard` | Read current leaderboard (top accounts by balance) |
| `GET` | `/health` | Health check |

### Risk server (`risk-server.ts`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/risk/update` | HTTP transport for risk command |
| `GET` | `/api/risk/:accountId` | Read risk assessment for an account |
| `GET` | `/health` | Health check |

---

## 11. Directory Layout

```
apps/e2e/funds/
├── package.json
├── tsconfig.json
├── docker-compose.yml
├── infrastructure/
│   ├── init.sql                         # account_leaderboard table + outbox trigger
│   └── debezium-connector.json          # Outbox event router connector config
└── src/
    ├── server.ts                        # Main: REST + leaderboard Kafka consumer
    ├── risk-server.ts                   # Risk: MongoDB Kafka consumer
    ├── abstractions/
    │   ├── commands/
    │   │   ├── CommandHandlerOrchestratorFactory.ts
    │   │   └── commandHandler.ts
    │   └── endpoints/
    │       ├── defineAutomationEndpoint.ts
    │       ├── AutomationEndpointFactory.ts
    │       ├── PgBossEndpointFactory.ts
    │       ├── PgBossEndpointConfig.ts
    │       ├── PgBossEndpointIdentity.ts
    │       ├── kafkaConsumerUtils.ts
    │       ├── discoverAutomations.ts
    │       └── IdempotencyGate.ts
    └── BusinessCapabilities/
        └── Funds/
            ├── swimlanes/Funds/
            │   ├── index.ts
            │   ├── events/
            │   │   ├── FundsDeposited.ts
            │   │   └── FundsWithdrawn.ts
            │   ├── views/
            │   │   └── Balance/
            │   │       ├── state.ts
            │   │       └── handlers.ts
            │   └── messages/
            │       └── fundsChangedMessages.ts
            └── slices/
                ├── DepositFunds/
                │   ├── command.ts
                │   ├── commandHandler.ts
                │   ├── adapter.ts
                │   └── http/index.ts
                ├── WithdrawFunds/
                │   ├── command.ts
                │   ├── commandHandler.ts
                │   ├── adapter.ts
                │   └── http/index.ts
                ├── AccountLeaderboard/
                │   ├── command.ts
                │   ├── commandHandler.ts
                │   ├── adapter.ts
                │   ├── kafka/index.ts
                │   └── http/index.ts
                └── RiskAssessment/
                    ├── command.ts
                    ├── commandHandler.ts
                    ├── adapter.ts
                    ├── kafka/index.ts
                    └── http/index.ts
```

---

## 12. Dependencies

```json
{
  "dependencies": {
    "@eventualize/core": "^6.0.0",
    "@eventualize/postgres-storage-adapter": "^6.0.0",
    "@eventualize/relational-storage-adapter": "^6.0.0",
    "@eventualize/types": "^6.0.0",
    "@opentelemetry/sdk-node": "^0.57.0",
    "@opentelemetry/auto-instrumentations-node": "^0.57.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.57.0",
    "@prisma/adapter-pg": "^7.1.0",
    "express": "^4.21.0",
    "kafkajs": "^2.2.4",
    "mongodb": "^6.0.0",
    "pg": "^8.0.0",
    "pg-boss": "^12.14.0"
  }
}
```
