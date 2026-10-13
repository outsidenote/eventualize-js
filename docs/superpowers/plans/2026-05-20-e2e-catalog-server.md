# E2E Service Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive service catalog (`http://localhost:3099`) to `apps/e2e/funds` that documents every REST endpoint and async event channel, with working "Try it out" for REST and read-only documentation for async.

**Architecture:** A dedicated `catalog-server` process spawned alongside `funds-main :3014` and `funds-risk :3013`. Each business server exposes `GET /openapi.json` (REST) and `GET /asyncapi.json` (async channels it owns). The catalog crawls both at startup, serves a Vite-built React SPA that renders `swagger-ui-react` + `@asyncapi/react-component`, and proxies "Try it out" requests through `/api/proxy/:service/*` to avoid CORS.

**Tech Stack:** Express, swagger-ui-react, @asyncapi/react-component, Vite, http-proxy-middleware, OpenAPI 3.1, AsyncAPI 3.0, node:test, tsx.

**Spec Reference:** [`docs/superpowers/specs/2026-05-20-e2e-catalog-server-design.md`](../specs/2026-05-20-e2e-catalog-server-design.md)

---

## File Structure

**Files to create:**

```
apps/e2e/funds/
├── catalog/
│   ├── package.json                                 (Task 5)
│   ├── tsconfig.json                                (Task 5)
│   ├── vite.config.ts                               (Task 5)
│   ├── index.html                                   (Task 10)
│   └── src/
│       ├── catalogConfig.ts                         (Task 6)
│       ├── specFetcher.ts                           (Task 7)
│       ├── specFetcher.test.ts                      (Task 7)
│       ├── proxy.ts                                 (Task 8)
│       ├── server.ts                                (Task 9)
│       ├── main.tsx                                 (Task 10)
│       └── App.tsx                                  (Task 11, 12)
└── src/BusinessCapabilities/Funds/
    ├── slices/
    │   ├── DepositFunds/openapi.ts                  (Task 1)
    │   ├── WithdrawFunds/openapi.ts                 (Task 1)
    │   ├── AccountLeaderboard/openapi.ts            (Task 1)
    │   ├── AccountLeaderboard/asyncapi.ts           (Task 2)
    │   ├── RiskAssessment/openapi.ts                (Task 1)
    │   └── RiskAssessment/asyncapi.ts               (Task 2)
    └── swimlanes/Funds/asyncapi.ts                  (Task 2)
```

**Files to modify:**

- `apps/e2e/funds/package.json` — add `openapi-types` dev dep (Task 1)
- `apps/e2e/funds/src/server.ts` — mount `/openapi.json` + `/asyncapi.json` (Task 3)
- `apps/e2e/funds/src/risk-server.ts` — mount `/openapi.json` + `/asyncapi.json` (Task 4)
- `apps/e2e/funds/src/index.ts` — spawn catalog-server (Task 13)

---

## Pre-flight: Baseline Health Check

Per `CLAUDE.md`, record baseline before starting:

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js"
pnpm build 2>&1 | grep "error TS" | wc -l
pnpm exec eslint . 2>&1 | grep -c " error "
```

Record both numbers. Every task must end with the same or fewer of each.

---

## Task 1: Slice OpenAPI Fragments

**Files:**
- Modify: `apps/e2e/funds/package.json`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/DepositFunds/openapi.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/WithdrawFunds/openapi.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/AccountLeaderboard/openapi.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/RiskAssessment/openapi.ts`

- [ ] **Step 1.1: Add `openapi-types` as dev dependency**

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js/apps/e2e/funds"
pnpm add -D openapi-types@^12.1.3
```

Expected: `package.json` updates and `node_modules` populated. Re-run the symlink commands in CLAUDE.md if subsequent builds fail with `separate declarations of a private property`.

- [ ] **Step 1.2: Create `DepositFunds/openapi.ts`**

Write to `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/DepositFunds/openapi.ts`:

```typescript
import type { OpenAPIV3_1 } from "openapi-types";

export const depositFundsOpenApi: OpenAPIV3_1.PathsObject = {
  "/api/funds/deposit": {
    post: {
      summary: "Deposit funds into an account",
      description: "Appends a FundsDeposited event to the account stream and produces a FundsChanged outbox message.",
      tags: ["Funds"],
      operationId: "depositFunds",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["accountId", "amount", "currency"],
              properties: {
                accountId: { type: "string", example: "acc-123" },
                amount: { type: "number", minimum: 0, example: 100 },
                currency: { type: "string", example: "USD" },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Deposit recorded",
          content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } },
        },
        "400": { description: "Validation error" },
        "500": { description: "Internal error" },
      },
    },
  },
};
```

- [ ] **Step 1.3: Create `WithdrawFunds/openapi.ts`**

Write to `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/WithdrawFunds/openapi.ts`:

```typescript
import type { OpenAPIV3_1 } from "openapi-types";

export const withdrawFundsOpenApi: OpenAPIV3_1.PathsObject = {
  "/api/funds/withdraw": {
    post: {
      summary: "Withdraw funds from an account",
      description: "Appends a FundsWithdrawn event to the account stream and produces a FundsChanged outbox message.",
      tags: ["Funds"],
      operationId: "withdrawFunds",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["accountId", "amount", "currency"],
              properties: {
                accountId: { type: "string", example: "acc-123" },
                amount: { type: "number", minimum: 0, example: 50 },
                currency: { type: "string", example: "USD" },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Withdrawal recorded",
          content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } },
        },
        "400": { description: "Validation error" },
        "500": { description: "Internal error" },
      },
    },
  },
};
```

- [ ] **Step 1.4: Create `AccountLeaderboard/openapi.ts`**

Write to `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/AccountLeaderboard/openapi.ts`:

```typescript
import type { OpenAPIV3_1 } from "openapi-types";

export const accountLeaderboardOpenApi: OpenAPIV3_1.PathsObject = {
  "/api/funds/leaderboard": {
    get: {
      summary: "List top accounts by balance",
      description: "Returns the leaderboard view (top 50 accounts by last_balance).",
      tags: ["Leaderboard"],
      operationId: "getLeaderboard",
      responses: {
        "200": {
          description: "Leaderboard rows",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  leaderboard: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        account_id: { type: "string" },
                        currency: { type: "string" },
                        total_deposited: { type: "number" },
                        total_withdrawn: { type: "number" },
                        last_balance: { type: "number" },
                        deposit_count: { type: "integer" },
                        withdrawal_count: { type: "integer" },
                        last_activity: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "/api/funds/leaderboard/update": {
    post: {
      summary: "Manually upsert a leaderboard row",
      description: "Bypasses the pg-boss queue. Used for testing the command handler directly.",
      tags: ["Leaderboard"],
      operationId: "updateLeaderboard",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["accountId", "delta", "currentBalance"],
              properties: {
                accountId: { type: "string", example: "acc-123" },
                delta: { type: "number", example: 100 },
                currentBalance: { type: "number", example: 500 },
                currency: { type: "string", example: "USD" },
                transactionId: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Row upserted" },
        "400": { description: "Validation error" },
        "500": { description: "Internal error" },
      },
    },
  },
};
```

- [ ] **Step 1.5: Create `RiskAssessment/openapi.ts`**

Write to `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/RiskAssessment/openapi.ts`:

```typescript
import type { OpenAPIV3_1 } from "openapi-types";

export const riskAssessmentOpenApi: OpenAPIV3_1.PathsObject = {
  "/api/risk/{accountId}": {
    get: {
      summary: "Get current risk assessment for an account",
      tags: ["Risk"],
      operationId: "getRisk",
      parameters: [
        { name: "accountId", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": {
          description: "Risk document",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  accountId: { type: "string" },
                  riskLevel: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
                  currentBalance: { type: "number" },
                  transactionCount: { type: "integer" },
                  assessedAt: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        "404": { description: "Account not found" },
      },
    },
  },
  "/api/risk/update": {
    post: {
      summary: "Manually upsert a risk assessment",
      description: "Bypasses the Kafka consumer. Used for testing.",
      tags: ["Risk"],
      operationId: "updateRisk",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["accountId", "delta", "currentBalance"],
              properties: {
                accountId: { type: "string" },
                delta: { type: "number" },
                currentBalance: { type: "number" },
                currency: { type: "string" },
                transactionId: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Risk upserted" },
        "400": { description: "Validation error" },
      },
    },
  },
};
```

- [ ] **Step 1.6: Verify build still passes**

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js"
pnpm build 2>&1 | grep "error TS" | wc -l
```

Expected: same count as baseline.

- [ ] **Step 1.7: Commit**

```bash
git add apps/e2e/funds/package.json apps/e2e/funds/src/BusinessCapabilities/Funds/slices/
git commit -m "$(cat <<'EOF'
feat(e2e-funds): add OpenAPI fragments per slice

Each slice now exports an OpenAPI 3.1 path fragment for its HTTP routes.
Servers will compose these into a single /openapi.json document.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Slice AsyncAPI Fragments

Ownership rule (per spec):
- `swimlanes/Funds` (broadcast producer) owns `funds.outbox` **send** operation.
- `AccountLeaderboard` (P2P consumer) owns `pgboss/leaderboard-update` **receive** operation.
- `RiskAssessment` (subscriber) owns `funds.outbox` **receive** operation.

**Files:**
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/swimlanes/Funds/asyncapi.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/AccountLeaderboard/asyncapi.ts`
- Create: `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/RiskAssessment/asyncapi.ts`

- [ ] **Step 2.1: Define a shared AsyncAPI fragment type**

We avoid the `@asyncapi/parser` runtime dependency by typing fragments with a minimal local type. Write to `apps/e2e/funds/src/BusinessCapabilities/Funds/swimlanes/Funds/asyncapi.ts`:

```typescript
// Minimal AsyncAPI 3.0 fragment shape. Full type lives in @asyncapi/parser
// but we only need a portable subset for slice-level composition.
export interface AsyncApiFragment {
  channels?: Record<string, unknown>;
  operations?: Record<string, unknown>;
  components?: { messages?: Record<string, unknown>; schemas?: Record<string, unknown> };
}

export const fundsOutboxAsyncApi: AsyncApiFragment = {
  channels: {
    "funds.outbox": {
      address: "funds.outbox",
      title: "Funds outbox (Kafka via Debezium CDC)",
      description: "Every FundsDeposited / FundsWithdrawn event in the funds stream produces a FundsChanged outbox row, which Debezium publishes to this Kafka topic.",
      messages: { FundsChanged: { $ref: "#/components/messages/FundsChanged" } },
      bindings: { kafka: { topic: "funds.outbox" } },
    },
  },
  operations: {
    sendFundsChanged: {
      action: "send",
      channel: { $ref: "#/channels/funds.outbox" },
      summary: "Broadcast a FundsChanged event",
      messages: [{ $ref: "#/channels/funds.outbox/messages/FundsChanged" }],
    },
  },
  components: {
    messages: {
      FundsChanged: {
        name: "FundsChanged",
        title: "Funds balance changed",
        contentType: "application/json",
        payload: {
          type: "object",
          required: ["accountId", "currentBalance", "delta", "currency", "transactionId"],
          properties: {
            accountId: { type: "string" },
            currentBalance: { type: "number" },
            delta: { type: "number", description: "Positive for deposits, negative for withdrawals" },
            currency: { type: "string" },
            transactionId: { type: "string" },
          },
        },
      },
    },
  },
};
```

- [ ] **Step 2.2: Create AccountLeaderboard AsyncAPI (P2P receive)**

Write to `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/AccountLeaderboard/asyncapi.ts`:

```typescript
import type { AsyncApiFragment } from "../../swimlanes/Funds/asyncapi.js";
import { LEADERBOARD_QUEUE } from "./pgboss/index.js";

export const leaderboardAsyncApi: AsyncApiFragment = {
  channels: {
    [`pgboss/${LEADERBOARD_QUEUE}`]: {
      address: LEADERBOARD_QUEUE,
      title: "Leaderboard update queue (pg-boss)",
      description: "Each row in funds_outbox of message_type=FundsChanged triggers a pg-boss job on this queue. The leaderboard worker consumes and upserts the account_leaderboard row.",
      messages: { LeaderboardUpdateJob: { $ref: "#/components/messages/LeaderboardUpdateJob" } },
      bindings: {
        "x-pgboss": { queue: LEADERBOARD_QUEUE },
      },
    },
  },
  operations: {
    receiveLeaderboardUpdate: {
      action: "receive",
      channel: { $ref: `#/channels/pgboss~1${LEADERBOARD_QUEUE}` },
      summary: "Consume a leaderboard update job",
      messages: [{ $ref: `#/channels/pgboss~1${LEADERBOARD_QUEUE}/messages/LeaderboardUpdateJob` }],
    },
  },
  components: {
    messages: {
      LeaderboardUpdateJob: {
        name: "LeaderboardUpdateJob",
        title: "Leaderboard upsert job",
        contentType: "application/json",
        payload: {
          type: "object",
          required: ["metadata", "payload"],
          properties: {
            metadata: {
              type: "object",
              properties: { outboxId: { type: "string" } },
            },
            payload: {
              type: "object",
              properties: {
                accountId: { type: "string" },
                currentBalance: { type: "number" },
                delta: { type: "number" },
                currency: { type: "string" },
                transactionId: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};
```

- [ ] **Step 2.3: Create RiskAssessment AsyncAPI (Kafka receive)**

Write to `apps/e2e/funds/src/BusinessCapabilities/Funds/slices/RiskAssessment/asyncapi.ts`:

```typescript
import type { AsyncApiFragment } from "../../swimlanes/Funds/asyncapi.js";

export const riskAssessmentAsyncApi: AsyncApiFragment = {
  channels: {
    "funds.outbox": {
      address: "funds.outbox",
      title: "Funds outbox (subscribed by risk service)",
      description: "Risk service consumes FundsChanged messages from this Kafka topic and updates the per-account risk document in MongoDB.",
      messages: { FundsChanged: { $ref: "#/components/messages/FundsChanged" } },
      bindings: { kafka: { topic: "funds.outbox", groupId: "e2e-funds-risk" } },
    },
  },
  operations: {
    receiveFundsChangedForRisk: {
      action: "receive",
      channel: { $ref: "#/channels/funds.outbox" },
      summary: "Process a FundsChanged event for risk re-assessment",
      messages: [{ $ref: "#/channels/funds.outbox/messages/FundsChanged" }],
    },
  },
  components: {
    messages: {
      FundsChanged: {
        name: "FundsChanged",
        title: "Funds balance changed (consumed by risk)",
        contentType: "application/json",
        payload: {
          type: "object",
          required: ["accountId", "currentBalance", "delta", "currency", "transactionId"],
          properties: {
            accountId: { type: "string" },
            currentBalance: { type: "number" },
            delta: { type: "number" },
            currency: { type: "string" },
            transactionId: { type: "string" },
          },
        },
      },
    },
  },
};
```

- [ ] **Step 2.4: Verify build still passes**

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js"
pnpm build 2>&1 | grep "error TS" | wc -l
```

Expected: same count as baseline.

- [ ] **Step 2.5: Commit**

```bash
git add apps/e2e/funds/src/BusinessCapabilities/Funds/
git commit -m "$(cat <<'EOF'
feat(e2e-funds): add AsyncAPI fragments per channel owner

- swimlanes/Funds owns 'send' on kafka funds.outbox (broadcast producer)
- AccountLeaderboard owns 'receive' on pgboss queue (P2P consumer)
- RiskAssessment owns 'receive' on kafka funds.outbox (subscriber)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Mount Spec Endpoints on funds-main Server

**Files:**
- Modify: `apps/e2e/funds/src/server.ts`

- [ ] **Step 3.1: Create a small spec composer helper**

Write to `apps/e2e/funds/src/abstractions/catalog/composeSpecs.ts`:

```typescript
import type { OpenAPIV3_1 } from "openapi-types";
import type { AsyncApiFragment } from "#BusinessCapabilities/Funds/swimlanes/Funds/asyncapi.js";

export interface ComposeOpenApiArgs {
  title: string;
  version: string;
  description?: string;
  paths: OpenAPIV3_1.PathsObject[];
}

export function composeOpenApi(args: ComposeOpenApiArgs): OpenAPIV3_1.Document {
  return {
    openapi: "3.1.0",
    info: { title: args.title, version: args.version, description: args.description },
    paths: Object.assign({}, ...args.paths),
  };
}

export interface ComposeAsyncApiArgs {
  title: string;
  version: string;
  description?: string;
  fragments: AsyncApiFragment[];
}

export function composeAsyncApi(args: ComposeAsyncApiArgs): Record<string, unknown> {
  const channels: Record<string, unknown> = {};
  const operations: Record<string, unknown> = {};
  const messages: Record<string, unknown> = {};
  const schemas: Record<string, unknown> = {};

  for (const f of args.fragments) {
    Object.assign(channels, f.channels ?? {});
    Object.assign(operations, f.operations ?? {});
    Object.assign(messages, f.components?.messages ?? {});
    Object.assign(schemas, f.components?.schemas ?? {});
  }

  return {
    asyncapi: "3.0.0",
    info: { title: args.title, version: args.version, description: args.description },
    channels,
    operations,
    components: { messages, schemas },
  };
}
```

- [ ] **Step 3.2: Update `server.ts` to mount `/openapi.json` and `/asyncapi.json`**

Modify `apps/e2e/funds/src/server.ts`. After the existing imports, add:

```typescript
import { composeOpenApi, composeAsyncApi } from "#abstractions/catalog/composeSpecs.js";
import { depositFundsOpenApi } from "#BusinessCapabilities/Funds/slices/DepositFunds/openapi.js";
import { withdrawFundsOpenApi } from "#BusinessCapabilities/Funds/slices/WithdrawFunds/openapi.js";
import { accountLeaderboardOpenApi } from "#BusinessCapabilities/Funds/slices/AccountLeaderboard/openapi.js";
import { fundsOutboxAsyncApi } from "#BusinessCapabilities/Funds/swimlanes/Funds/asyncapi.js";
import { leaderboardAsyncApi } from "#BusinessCapabilities/Funds/slices/AccountLeaderboard/asyncapi.js";
```

Then, **immediately after** the existing line:

```typescript
app.get("/health", (_req, res) => res.json({ status: "ok", service: "funds-main" }));
```

insert:

```typescript
app.get("/openapi.json", (_req, res) => {
  res.json(composeOpenApi({
    title: "funds-main",
    version: "1.0.0",
    description: "REST endpoints for the funds main server (deposits, withdrawals, leaderboard view).",
    paths: [depositFundsOpenApi, withdrawFundsOpenApi, accountLeaderboardOpenApi],
  }));
});

app.get("/asyncapi.json", (_req, res) => {
  res.json(composeAsyncApi({
    title: "funds-main async",
    version: "1.0.0",
    description: "Async channels owned by funds-main: outbox 'send' (broadcast) + pg-boss 'receive' (P2P consumer).",
    fragments: [fundsOutboxAsyncApi, leaderboardAsyncApi],
  }));
});
```

- [ ] **Step 3.3: Start the server and verify spec endpoints respond**

In one terminal:

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js/apps/e2e/funds"
docker compose up -d postgres
pnpm start:main &
sleep 5
```

In another shell or after it boots:

```bash
curl -s http://localhost:3014/openapi.json | head -c 200
echo
curl -s http://localhost:3014/asyncapi.json | head -c 200
```

Expected: both return valid JSON starting with `{"openapi":"3.1.0"...` and `{"asyncapi":"3.0.0"...` respectively.

Kill the server: `kill %1`.

- [ ] **Step 3.4: Verify build + lint counts unchanged**

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js"
pnpm build 2>&1 | grep "error TS" | wc -l
pnpm exec eslint . 2>&1 | grep -c " error "
```

Expected: both same as baseline.

- [ ] **Step 3.5: Commit**

```bash
git add apps/e2e/funds/src/server.ts apps/e2e/funds/src/abstractions/catalog/
git commit -m "$(cat <<'EOF'
feat(e2e-funds): expose /openapi.json + /asyncapi.json on funds-main

funds-main now serves an aggregated OpenAPI 3.1 doc (deposits, withdrawals,
leaderboard) and AsyncAPI 3.0 doc (outbox send + pgboss receive).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Mount Spec Endpoints on risk-server

**Files:**
- Modify: `apps/e2e/funds/src/risk-server.ts`

- [ ] **Step 4.1: Update `risk-server.ts`**

Modify `apps/e2e/funds/src/risk-server.ts`. After existing imports, add:

```typescript
import { composeOpenApi, composeAsyncApi } from "#abstractions/catalog/composeSpecs.js";
import { riskAssessmentOpenApi } from "#BusinessCapabilities/Funds/slices/RiskAssessment/openapi.js";
import { riskAssessmentAsyncApi } from "#BusinessCapabilities/Funds/slices/RiskAssessment/asyncapi.js";
```

Immediately after the existing line:

```typescript
app.get("/health", (_req, res) => res.json({ status: "ok", service: "funds-risk" }));
```

insert:

```typescript
app.get("/openapi.json", (_req, res) => {
  res.json(composeOpenApi({
    title: "funds-risk",
    version: "1.0.0",
    description: "REST endpoints for the funds risk-assessment server.",
    paths: [riskAssessmentOpenApi],
  }));
});

app.get("/asyncapi.json", (_req, res) => {
  res.json(composeAsyncApi({
    title: "funds-risk async",
    version: "1.0.0",
    description: "Async channels owned by funds-risk: kafka 'receive' for funds.outbox subscription.",
    fragments: [riskAssessmentAsyncApi],
  }));
});
```

- [ ] **Step 4.2: Smoke test**

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js/apps/e2e/funds"
docker compose up -d mongodb kafka
pnpm start:risk &
sleep 5
curl -s http://localhost:3013/openapi.json | head -c 200
echo
curl -s http://localhost:3013/asyncapi.json | head -c 200
kill %1
```

Expected: both return valid JSON specs.

- [ ] **Step 4.3: Verify counts unchanged**

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js"
pnpm build 2>&1 | grep "error TS" | wc -l
pnpm exec eslint . 2>&1 | grep -c " error "
```

- [ ] **Step 4.4: Commit**

```bash
git add apps/e2e/funds/src/risk-server.ts
git commit -m "$(cat <<'EOF'
feat(e2e-funds): expose /openapi.json + /asyncapi.json on funds-risk

funds-risk serves its REST routes (risk-by-id, risk update) and the
'receive' AsyncAPI doc for kafka funds.outbox subscription.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Scaffold Catalog Package

**Files:**
- Create: `apps/e2e/funds/catalog/package.json`
- Create: `apps/e2e/funds/catalog/tsconfig.json`
- Create: `apps/e2e/funds/catalog/vite.config.ts`

- [ ] **Step 5.1: Create `catalog/` directory and `package.json`**

```bash
mkdir -p "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js/apps/e2e/funds/catalog/src"
```

Write to `apps/e2e/funds/catalog/package.json`:

```json
{
  "name": "e2e-funds-catalog",
  "version": "1.0.0",
  "private": true,
  "description": "Service catalog UI for the funds e2e app",
  "type": "module",
  "scripts": {
    "build:ui": "vite build",
    "build:server": "tsc --build",
    "build": "pnpm run build:ui && pnpm run build:server",
    "clean": "rimraf dist tsconfig.tsbuildinfo",
    "start": "node --import tsx src/server.ts",
    "test:unit": "node --import tsx --test 'src/**/*.test.ts'"
  },
  "dependencies": {
    "express": "^4.21.0",
    "http-proxy-middleware": "^3.0.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "swagger-ui-react": "^5.17.14",
    "@asyncapi/react-component": "^2.4.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^24.0.0",
    "@types/react": "^18.3.10",
    "@types/react-dom": "^18.3.0",
    "@types/swagger-ui-react": "^4.18.3",
    "@vitejs/plugin-react": "^4.3.1",
    "openapi-types": "^12.1.3",
    "tsx": "^4.21.0",
    "typescript": "^6.0.2",
    "vite": "^5.4.8"
  }
}
```

- [ ] **Step 5.2: Create `tsconfig.json`**

Write to `apps/e2e/funds/catalog/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "dist/server",
    "rootDir": "src",
    "declaration": false,
    "sourceMap": true,
    "composite": false,
    "noEmit": false,
    "verbatimModuleSyntax": false,
    "allowImportingTsExtensions": false
  },
  "include": ["src/server.ts", "src/specFetcher.ts", "src/proxy.ts", "src/catalogConfig.ts"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 5.3: Create `vite.config.ts`**

Write to `apps/e2e/funds/catalog/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  root: ".",
  build: {
    outDir: "dist/ui",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
    },
  },
});
```

- [ ] **Step 5.4: Install dependencies**

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js/apps/e2e/funds/catalog"
pnpm install
```

Expected: dependencies resolve. If the workspace's `pnpm-workspace.yaml` picks up the new package automatically, great. If not, check `apps/e2e/funds/pnpm-workspace.yaml` and add `catalog` to its `packages:` list.

- [ ] **Step 5.5: Commit**

```bash
git add apps/e2e/funds/catalog/package.json apps/e2e/funds/catalog/tsconfig.json apps/e2e/funds/catalog/vite.config.ts apps/e2e/funds/pnpm-lock.yaml apps/e2e/funds/pnpm-workspace.yaml
git commit -m "$(cat <<'EOF'
chore(e2e-funds-catalog): scaffold catalog package

New workspace package under apps/e2e/funds/catalog with Vite + Express +
swagger-ui-react + @asyncapi/react-component dependencies.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Catalog Configuration

**Files:**
- Create: `apps/e2e/funds/catalog/src/catalogConfig.ts`

- [ ] **Step 6.1: Write `catalogConfig.ts`**

Write to `apps/e2e/funds/catalog/src/catalogConfig.ts`:

```typescript
export interface CatalogServiceDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly baseUrl: string;
  readonly openApiPath?: string;   // default: "/openapi.json"
  readonly asyncApiPath?: string;  // default: "/asyncapi.json"
}

export interface CatalogConfig {
  readonly appName: string;
  readonly port: number;
  readonly services: ReadonlyArray<CatalogServiceDescriptor>;
}

export const fundsCatalogConfig: CatalogConfig = {
  appName: "funds e2e",
  port: Number(process.env.CATALOG_PORT ?? 3099),
  services: [
    {
      id: "funds-main",
      displayName: "Funds Main",
      baseUrl: process.env.FUNDS_MAIN_URL ?? "http://localhost:3014",
    },
    {
      id: "funds-risk",
      displayName: "Funds Risk",
      baseUrl: process.env.FUNDS_RISK_URL ?? "http://localhost:3013",
    },
  ],
};
```

- [ ] **Step 6.2: Commit**

```bash
git add apps/e2e/funds/catalog/src/catalogConfig.ts
git commit -m "$(cat <<'EOF'
feat(e2e-funds-catalog): add catalog configuration

CatalogConfig + CatalogServiceDescriptor interfaces; fundsCatalogConfig
hard-codes funds-main and funds-risk with env-var overrides.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Spec Fetcher with Retry-with-Backoff (TDD)

**Files:**
- Create: `apps/e2e/funds/catalog/src/specFetcher.ts`
- Create: `apps/e2e/funds/catalog/src/specFetcher.test.ts`

- [ ] **Step 7.1: Write the failing test**

Write to `apps/e2e/funds/catalog/src/specFetcher.test.ts`:

```typescript
import { test, describe } from "node:test";
import * as assert from "node:assert";
import { fetchServiceSpecs, type FetchOptions } from "./specFetcher.js";
import type { CatalogServiceDescriptor } from "./catalogConfig.js";

function stubFetch(responses: Map<string, { status: number; body: unknown } | "error">): typeof fetch {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const r = responses.get(url);
    if (!r) throw new Error(`unexpected url: ${url}`);
    if (r === "error") throw new Error("network down");
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  };
}

const fastOpts: FetchOptions = { initialDelayMs: 1, maxDelayMs: 4, totalTimeoutMs: 20, fetchImpl: undefined };

describe("fetchServiceSpecs", () => {
  test("returns online status with both specs when endpoints succeed", async () => {
    const svc: CatalogServiceDescriptor = { id: "x", displayName: "X", baseUrl: "http://h" };
    const responses = new Map<string, { status: number; body: unknown }>();
    responses.set("http://h/openapi.json", { status: 200, body: { openapi: "3.1.0", info: { title: "x" } } });
    responses.set("http://h/asyncapi.json", { status: 200, body: { asyncapi: "3.0.0", info: { title: "x" } } });
    const result = await fetchServiceSpecs(svc, { ...fastOpts, fetchImpl: stubFetch(responses) });
    assert.strictEqual(result.status, "online");
    assert.deepStrictEqual(result.openapi, { openapi: "3.1.0", info: { title: "x" } });
    assert.deepStrictEqual(result.asyncapi, { asyncapi: "3.0.0", info: { title: "x" } });
  });

  test("returns offline status when all attempts fail within totalTimeoutMs", async () => {
    const svc: CatalogServiceDescriptor = { id: "y", displayName: "Y", baseUrl: "http://h" };
    const responses = new Map<string, "error">();
    responses.set("http://h/openapi.json", "error");
    responses.set("http://h/asyncapi.json", "error");
    const result = await fetchServiceSpecs(svc, { ...fastOpts, fetchImpl: stubFetch(responses) });
    assert.strictEqual(result.status, "offline");
    assert.strictEqual(result.openapi, null);
    assert.strictEqual(result.asyncapi, null);
    assert.ok(result.error && result.error.length > 0);
  });

  test("returns partial status when only one spec endpoint succeeds", async () => {
    const svc: CatalogServiceDescriptor = { id: "z", displayName: "Z", baseUrl: "http://h" };
    const responses = new Map<string, { status: number; body: unknown } | "error">();
    responses.set("http://h/openapi.json", { status: 200, body: { openapi: "3.1.0", info: { title: "z" } } });
    responses.set("http://h/asyncapi.json", "error");
    const result = await fetchServiceSpecs(svc, { ...fastOpts, fetchImpl: stubFetch(responses) });
    assert.strictEqual(result.status, "partial");
    assert.ok(result.openapi !== null);
    assert.strictEqual(result.asyncapi, null);
  });
});
```

- [ ] **Step 7.2: Run the test (must fail)**

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js/apps/e2e/funds/catalog"
pnpm test:unit
```

Expected: FAIL — `specFetcher.js` does not exist.

- [ ] **Step 7.3: Implement `specFetcher.ts`**

Write to `apps/e2e/funds/catalog/src/specFetcher.ts`:

```typescript
import type { CatalogServiceDescriptor } from "./catalogConfig.js";

export interface FetchOptions {
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly totalTimeoutMs: number;
  readonly fetchImpl?: typeof fetch;
}

export const DEFAULT_FETCH_OPTIONS: FetchOptions = {
  initialDelayMs: 200,
  maxDelayMs: 5000,
  totalTimeoutMs: 30_000,
};

export type ServiceStatus = "online" | "offline" | "partial";

export interface ServiceSpecResult {
  readonly id: string;
  readonly displayName: string;
  readonly baseUrl: string;
  readonly status: ServiceStatus;
  readonly openapi: unknown | null;
  readonly asyncapi: unknown | null;
  readonly fetchedAt: string;
  readonly error?: string;
}

async function retryFetchJson(
  url: string,
  opts: FetchOptions,
): Promise<unknown> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const startedAt = Date.now();
  let delay = opts.initialDelayMs;
  let lastErr: unknown = null;
  while (Date.now() - startedAt < opts.totalTimeoutMs) {
    try {
      const res = await fetchImpl(url);
      if (res.ok) {
        return await res.json();
      }
      lastErr = new Error(`HTTP ${res.status} from ${url}`);
    } catch (err) {
      lastErr = err;
    }
    if (Date.now() - startedAt + delay > opts.totalTimeoutMs) break;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(opts.maxDelayMs, delay * 2);
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchServiceSpecs(
  svc: CatalogServiceDescriptor,
  opts: FetchOptions = DEFAULT_FETCH_OPTIONS,
): Promise<ServiceSpecResult> {
  const openApiUrl = `${svc.baseUrl}${svc.openApiPath ?? "/openapi.json"}`;
  const asyncApiUrl = `${svc.baseUrl}${svc.asyncApiPath ?? "/asyncapi.json"}`;

  const [openApiSettled, asyncApiSettled] = await Promise.allSettled([
    retryFetchJson(openApiUrl, opts),
    retryFetchJson(asyncApiUrl, opts),
  ]);

  const openapi = openApiSettled.status === "fulfilled" ? openApiSettled.value : null;
  const asyncapi = asyncApiSettled.status === "fulfilled" ? asyncApiSettled.value : null;

  let status: ServiceStatus;
  if (openapi && asyncapi) status = "online";
  else if (!openapi && !asyncapi) status = "offline";
  else status = "partial";

  const errors: string[] = [];
  if (openApiSettled.status === "rejected") errors.push(`openapi: ${String(openApiSettled.reason)}`);
  if (asyncApiSettled.status === "rejected") errors.push(`asyncapi: ${String(asyncApiSettled.reason)}`);

  return {
    id: svc.id,
    displayName: svc.displayName,
    baseUrl: svc.baseUrl,
    status,
    openapi,
    asyncapi,
    fetchedAt: new Date().toISOString(),
    ...(errors.length ? { error: errors.join("; ") } : {}),
  };
}
```

- [ ] **Step 7.4: Run the test (must pass)**

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js/apps/e2e/funds/catalog"
pnpm test:unit
```

Expected: all 3 tests pass.

- [ ] **Step 7.5: Commit**

```bash
git add apps/e2e/funds/catalog/src/specFetcher.ts apps/e2e/funds/catalog/src/specFetcher.test.ts
git commit -m "$(cat <<'EOF'
feat(e2e-funds-catalog): add spec fetcher with retry-with-backoff

fetchServiceSpecs retries each spec endpoint with exponential backoff up
to a total timeout, returning status online/partial/offline. Tested with
stub fetch covering all three outcomes.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Proxy Middleware

**Files:**
- Create: `apps/e2e/funds/catalog/src/proxy.ts`

- [ ] **Step 8.1: Write `proxy.ts`**

Write to `apps/e2e/funds/catalog/src/proxy.ts`:

```typescript
import type { RequestHandler } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import type { CatalogServiceDescriptor } from "./catalogConfig.js";

/**
 * Returns an Express middleware mounted at /api/proxy/:service/* that
 * forwards the remainder of the path to that service's baseUrl. Used by
 * Swagger UI's requestInterceptor to bypass browser CORS.
 */
export function createCatalogProxy(services: ReadonlyArray<CatalogServiceDescriptor>): RequestHandler {
  const byId = new Map(services.map((s) => [s.id, s]));

  return (req, res, next) => {
    // Path looks like: /api/proxy/funds-main/api/funds/deposit
    const match = req.url.match(/^\/([^/]+)(\/.*)?$/);
    if (!match) {
      res.status(404).json({ error: "proxy path missing service id" });
      return;
    }
    const [, serviceId, rest = "/"] = match;
    const svc = byId.get(serviceId);
    if (!svc) {
      res.status(404).json({ error: `unknown service: ${serviceId}` });
      return;
    }

    const middleware = createProxyMiddleware({
      target: svc.baseUrl,
      changeOrigin: true,
      pathRewrite: () => rest,
      logger: console,
    });
    middleware(req, res, next);
  };
}
```

- [ ] **Step 8.2: Sanity-check compile**

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js/apps/e2e/funds/catalog"
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: no errors. Integration test happens in Task 14.

- [ ] **Step 8.3: Commit**

```bash
git add apps/e2e/funds/catalog/src/proxy.ts
git commit -m "$(cat <<'EOF'
feat(e2e-funds-catalog): add CORS-bypass proxy middleware

createCatalogProxy mounts /api/proxy/:service/* and forwards to the
matching service's baseUrl. Used by Swagger UI requestInterceptor.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Catalog Server

**Files:**
- Create: `apps/e2e/funds/catalog/src/server.ts`

- [ ] **Step 9.1: Write `server.ts`**

Write to `apps/e2e/funds/catalog/src/server.ts`:

```typescript
import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

import { fundsCatalogConfig, type CatalogConfig } from "./catalogConfig.js";
import { fetchServiceSpecs, type ServiceSpecResult, DEFAULT_FETCH_OPTIONS } from "./specFetcher.js";
import { createCatalogProxy } from "./proxy.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// dist layout from `vite build`:  catalog/dist/ui/index.html
// when running via tsx, __dirname is catalog/src — so up two levels then into dist/ui
const uiDist = join(__dirname, "..", "dist", "ui");

interface CatalogState {
  config: CatalogConfig;
  services: ServiceSpecResult[];
  lastRefreshAt: string | null;
}

async function refreshAllSpecs(config: CatalogConfig): Promise<ServiceSpecResult[]> {
  return Promise.all(
    config.services.map((svc) =>
      fetchServiceSpecs(svc, DEFAULT_FETCH_OPTIONS).catch((err) => ({
        id: svc.id,
        displayName: svc.displayName,
        baseUrl: svc.baseUrl,
        status: "offline" as const,
        openapi: null,
        asyncapi: null,
        fetchedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      })),
    ),
  );
}

async function main(): Promise<void> {
  const config = fundsCatalogConfig;
  const state: CatalogState = { config, services: [], lastRefreshAt: null };

  // Initial spec fetch — runs in background, does not block server startup.
  void (async () => {
    console.log("[catalog] fetching specs from", config.services.map((s) => s.baseUrl).join(", "));
    state.services = await refreshAllSpecs(config);
    state.lastRefreshAt = new Date().toISOString();
    for (const s of state.services) {
      console.log(`[catalog] ${s.id}: ${s.status}${s.error ? ` (${s.error})` : ""}`);
    }
  })();

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok", service: "funds-catalog" }));

  app.get("/api/specs", (_req, res) => {
    res.json({
      appName: config.appName,
      lastRefreshAt: state.lastRefreshAt,
      services: state.services,
    });
  });

  app.post("/api/specs/refresh", async (_req, res) => {
    state.services = await refreshAllSpecs(config);
    state.lastRefreshAt = new Date().toISOString();
    res.json({ ok: true, lastRefreshAt: state.lastRefreshAt });
  });

  app.use("/api/proxy", createCatalogProxy(config.services));

  // Static UI — only if built. If `dist/ui` is missing, return a help page.
  if (existsSync(uiDist)) {
    app.use(express.static(uiDist));
    app.get("*", (_req, res) => res.sendFile(join(uiDist, "index.html")));
  } else {
    app.get("/", (_req, res) =>
      res.status(503).send(
        `<h1>Catalog UI not built</h1><p>Run <code>pnpm --filter e2e-funds-catalog build:ui</code> to build the UI, or use the JSON API at <a href="/api/specs">/api/specs</a>.</p>`,
      ),
    );
  }

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, resolve);
  });
  console.log(`[catalog] running at http://localhost:${config.port}`);

  const shutdown = (signal: string) => {
    console.log(`[catalog] ${signal} received`);
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[catalog] startup failed:", err);
  process.exit(1);
});
```

- [ ] **Step 9.2: Start the catalog server (without UI yet) and verify /api/specs**

First make sure funds-main and funds-risk are running:

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js/apps/e2e/funds"
docker compose up -d
pnpm start &
sleep 8   # let main + risk boot

cd catalog
pnpm start &
sleep 12  # let catalog finish spec crawl
curl -s http://localhost:3099/api/specs | head -c 400
echo
kill %1 %2 || true
```

Expected: JSON response with `appName: "funds e2e"`, `services` array containing `funds-main` (status `online`) and `funds-risk` (status `online`). Visiting `http://localhost:3099/` returns the 503 "UI not built" placeholder.

- [ ] **Step 9.3: Commit**

```bash
git add apps/e2e/funds/catalog/src/server.ts
git commit -m "$(cat <<'EOF'
feat(e2e-funds-catalog): add catalog server

Express server with /api/specs (aggregated), /api/specs/refresh, and
/api/proxy/:service/* (CORS bypass). Serves Vite build from dist/ui if
present, otherwise returns a help page.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: React App Scaffold (UI Bootstrap)

**Files:**
- Create: `apps/e2e/funds/catalog/index.html`
- Create: `apps/e2e/funds/catalog/src/main.tsx`
- Create: `apps/e2e/funds/catalog/src/App.tsx`

- [ ] **Step 10.1: Create `index.html`**

Write to `apps/e2e/funds/catalog/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>funds catalog</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-react/swagger-ui.css" />
    <style>
      body { margin: 0; font-family: -apple-system, system-ui, sans-serif; background: #fafafa; }
      header { padding: 12px 20px; background: #1e293b; color: #fff; display: flex; justify-content: space-between; align-items: center; }
      .tabs { display: flex; gap: 8px; padding: 12px 20px; border-bottom: 1px solid #e2e8f0; background: #fff; }
      .tab { padding: 6px 14px; border-radius: 4px; cursor: pointer; background: #f1f5f9; }
      .tab.active { background: #1e40af; color: #fff; }
      .health { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
      .health.online { background: #22c55e; }
      .health.partial { background: #eab308; }
      .health.offline { background: #ef4444; }
      .panel { padding: 16px 20px; }
      .panel h2 { margin: 24px 0 12px; font-size: 18px; color: #334155; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 10.2: Create `main.tsx`**

Write to `apps/e2e/funds/catalog/src/main.tsx`:

```typescript
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const root = document.getElementById("root");
if (!root) throw new Error("root element missing");
createRoot(root).render(<App />);
```

- [ ] **Step 10.3: Create minimal `App.tsx` (skeleton — fills in next tasks)**

Write to `apps/e2e/funds/catalog/src/App.tsx`:

```typescript
import { useEffect, useState } from "react";

interface ServiceResult {
  id: string;
  displayName: string;
  baseUrl: string;
  status: "online" | "partial" | "offline";
  openapi: unknown | null;
  asyncapi: unknown | null;
  fetchedAt: string;
  error?: string;
}

interface SpecsResponse {
  appName: string;
  lastRefreshAt: string | null;
  services: ServiceResult[];
}

export function App() {
  const [data, setData] = useState<SpecsResponse | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/specs")
      .then((r) => r.json() as Promise<SpecsResponse>)
      .then((d) => {
        setData(d);
        if (d.services.length > 0) setActiveId(d.services[0].id);
      });
  }, []);

  if (!data) return <div style={{ padding: 20 }}>Loading specs…</div>;

  const active = data.services.find((s) => s.id === activeId) ?? null;

  return (
    <>
      <header>
        <h1 style={{ margin: 0, fontSize: 18 }}>{data.appName} — service catalog</h1>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          {data.lastRefreshAt ? `Last refresh: ${new Date(data.lastRefreshAt).toLocaleTimeString()}` : "Refreshing…"}
        </span>
      </header>
      <div className="tabs">
        {data.services.map((s) => (
          <div
            key={s.id}
            className={`tab ${s.id === activeId ? "active" : ""}`}
            onClick={() => setActiveId(s.id)}
          >
            <span className={`health ${s.status}`} />
            {s.displayName} ({s.status})
          </div>
        ))}
      </div>
      <div className="panel">
        {active ? <ServicePanel service={active} /> : <p>No service selected</p>}
      </div>
    </>
  );
}

function ServicePanel({ service }: { service: ServiceResult }) {
  return (
    <>
      <h2>REST — {service.displayName}</h2>
      {service.openapi ? <pre style={{ background: "#fff", padding: 12, borderRadius: 4, overflow: "auto" }}>{JSON.stringify(service.openapi, null, 2).slice(0, 600)}…</pre> : <p>No OpenAPI spec available.</p>}
      <h2>Async — {service.displayName}</h2>
      {service.asyncapi ? <pre style={{ background: "#fff", padding: 12, borderRadius: 4, overflow: "auto" }}>{JSON.stringify(service.asyncapi, null, 2).slice(0, 600)}…</pre> : <p>No AsyncAPI spec available.</p>}
      {service.error && <p style={{ color: "#ef4444" }}>Error: {service.error}</p>}
    </>
  );
}
```

- [ ] **Step 10.4: Build the UI and verify it renders**

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js/apps/e2e/funds/catalog"
pnpm build:ui
ls dist/ui/index.html  # expect: dist/ui/index.html exists
```

Then with all servers running (as in Task 9.2), restart the catalog server and load `http://localhost:3099/` in a browser — you should see the header, two tabs (`Funds Main` / `Funds Risk`) with green dots, and JSON dumps of each spec.

- [ ] **Step 10.5: Commit**

```bash
git add apps/e2e/funds/catalog/index.html apps/e2e/funds/catalog/src/main.tsx apps/e2e/funds/catalog/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(e2e-funds-catalog): scaffold React UI with service tabs

Tabs per service, health-dot indicator (online/partial/offline), JSON
dump of REST + Async specs. Placeholder for full Swagger UI + AsyncAPI
React integration (next tasks).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Integrate swagger-ui-react with Proxy requestInterceptor

**Files:**
- Modify: `apps/e2e/funds/catalog/src/App.tsx`

- [ ] **Step 11.1: Replace the REST `<pre>` block in `ServicePanel` with Swagger UI**

Modify `apps/e2e/funds/catalog/src/App.tsx`. At the top add:

```typescript
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
```

Then replace the **REST section** inside `ServicePanel` (the `<h2>REST...</h2>` + its `<pre>`) with:

```typescript
      <h2>REST — {service.displayName}</h2>
      {service.openapi ? (
        <SwaggerUI
          spec={service.openapi as object}
          requestInterceptor={(req: { url: string }) => {
            // Rewrite all "Try it out" calls to go through the catalog proxy.
            try {
              const u = new URL(req.url);
              const base = new URL(service.baseUrl);
              if (u.origin === base.origin) {
                req.url = `${window.location.origin}/api/proxy/${service.id}${u.pathname}${u.search}`;
              }
            } catch {
              /* relative URL — leave alone */
            }
            return req;
          }}
        />
      ) : (
        <p>No OpenAPI spec available.</p>
      )}
```

- [ ] **Step 11.2: Rebuild and smoke test "Try it out"**

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js/apps/e2e/funds/catalog"
pnpm build:ui
```

Restart all servers (funds-main, funds-risk, catalog). Load `http://localhost:3099/`. In the `Funds Main` tab, expand `POST /api/funds/deposit`, click **Try it out**, paste:

```json
{ "accountId": "smoke-test-1", "amount": 100, "currency": "USD" }
```

then **Execute**. Expected: 200 response, network tab shows the call going to `http://localhost:3099/api/proxy/funds-main/api/funds/deposit`.

- [ ] **Step 11.3: Commit**

```bash
git add apps/e2e/funds/catalog/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(e2e-funds-catalog): render REST with swagger-ui-react via proxy

swagger-ui-react renders each service's OpenAPI spec. requestInterceptor
rewrites Try-it-out URLs through /api/proxy/:service/* so the browser
never hits the upstream directly (no CORS needed).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Integrate @asyncapi/react-component

**Files:**
- Modify: `apps/e2e/funds/catalog/src/App.tsx`

- [ ] **Step 12.1: Replace the Async `<pre>` block with the AsyncAPI React component**

Modify `apps/e2e/funds/catalog/src/App.tsx`. At the top of the file (alongside the SwaggerUI import) add:

```typescript
import { AsyncApiComponent } from "@asyncapi/react-component";
import "@asyncapi/react-component/styles/default.min.css";
```

Then replace the **Async section** inside `ServicePanel` (the `<h2>Async...</h2>` + its `<pre>`) with:

```typescript
      <h2>Async — {service.displayName}</h2>
      {service.asyncapi ? (
        <AsyncApiComponent
          schema={service.asyncapi as object}
          config={{ show: { sidebar: false, errors: false } }}
        />
      ) : (
        <p>No AsyncAPI spec available.</p>
      )}
```

- [ ] **Step 12.2: Rebuild and verify async section renders**

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js/apps/e2e/funds/catalog"
pnpm build:ui
```

Reload `http://localhost:3099/`. Below the Swagger UI section, the AsyncAPI viewer should render each channel with its message schema, bindings (kafka topic name / x-pgboss queue), and operation badge (`send` / `receive`).

- [ ] **Step 12.3: Commit**

```bash
git add apps/e2e/funds/catalog/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(e2e-funds-catalog): render async with @asyncapi/react-component

Each service's AsyncAPI doc renders below the Swagger UI section,
showing channel addresses, message schemas, bindings, and send/receive
operations.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Wire Catalog into Orchestrator

**Files:**
- Modify: `apps/e2e/funds/src/index.ts`

- [ ] **Step 13.1: Add catalog to the spawn list**

Modify `apps/e2e/funds/src/index.ts`. Replace the `servers` array with:

```typescript
const servers = [
  { name: "main",    file: join(__dirname, "server.ts"),                  color: "\x1b[36m" },
  { name: "risk",    file: join(__dirname, "risk-server.ts"),             color: "\x1b[35m" },
  { name: "catalog", file: join(__dirname, "../catalog/src/server.ts"),   color: "\x1b[33m" },
];
```

- [ ] **Step 13.2: Verify single-command startup**

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js/apps/e2e/funds"
docker compose up -d
pnpm start
```

Wait until logs show:
- `[main] [Startup] funds server running at http://localhost:3014`
- `[risk] [Startup] risk server running at http://localhost:3013`
- `[catalog] [catalog] running at http://localhost:3099`

Load `http://localhost:3099/` — full catalog should render with both services online.

Hit `Ctrl+C` to confirm graceful shutdown of all three processes.

- [ ] **Step 13.3: Verify build + lint counts unchanged**

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js"
pnpm build 2>&1 | grep "error TS" | wc -l
pnpm exec eslint . 2>&1 | grep -c " error "
```

Both must equal the baseline numbers from Pre-flight.

- [ ] **Step 13.4: Commit**

```bash
git add apps/e2e/funds/src/index.ts
git commit -m "$(cat <<'EOF'
feat(e2e-funds): orchestrator spawns catalog server alongside main + risk

\`pnpm start\` now boots all three processes. Catalog is reachable at
http://localhost:3099.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: End-to-End Verification Checklist

No code changes — manual walk-through against the success criteria from the spec.

- [ ] **Step 14.1: Start everything fresh**

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js/apps/e2e/funds"
docker compose down -v
docker compose up -d
pnpm start
```

- [ ] **Step 14.2: Walk through the success criteria**

In a browser open `http://localhost:3099/` and check each item:

1. Header shows "funds e2e — service catalog" and a "Last refresh" timestamp.
2. Two tabs visible: `Funds Main (online)` with green dot, `Funds Risk (online)` with green dot.
3. **Funds Main tab → REST section:** Swagger UI lists `POST /api/funds/deposit`, `POST /api/funds/withdraw`, `POST /api/funds/leaderboard/update`, `GET /api/funds/leaderboard`.
4. **Funds Main tab → Try it out:** expand `POST /api/funds/deposit`, send `{"accountId":"verify-1","amount":250,"currency":"USD"}` — response 200 `{"ok":true}`.
5. **Funds Main tab → Async section:** shows two channels — `funds.outbox` with `send` badge and `pgboss/event.FundsChanged.UpdateAccountLeaderboard` with `receive` badge. Both display the `FundsChanged` / `LeaderboardUpdateJob` message schema.
6. **Funds Risk tab → REST section:** lists `GET /api/risk/{accountId}` and `POST /api/risk/update`.
7. **Funds Risk tab → Async section:** shows `funds.outbox` with `receive` badge (subscriber).
8. **Refresh:** `curl -X POST http://localhost:3099/api/specs/refresh` returns `{ok: true, lastRefreshAt: …}`. Reload UI — timestamp updates.
9. **Offline degradation:** Kill funds-risk (`pkill -f risk-server.ts` from a separate shell) and POST `/api/specs/refresh` again. The `Funds Risk` tab dot turns red (`offline`) and the panel shows "No OpenAPI spec available" + error. Restart with `pnpm start:risk &` and re-refresh — dot goes green again.

- [ ] **Step 14.3: Final build + lint check**

```bash
cd "/Users/bnaya/Documents/Code/Open Sources/EvDb Family/eventualize-js"
pnpm build 2>&1 | grep "error TS" | wc -l
pnpm exec eslint . 2>&1 | grep -c " error "
```

Both equal baseline.

- [ ] **Step 14.4: Mark the spec's success criteria checkboxes**

Open `docs/superpowers/specs/2026-05-20-e2e-catalog-server-design.md` and check off each success criterion that's now satisfied.

- [ ] **Step 14.5: Commit the spec updates**

```bash
git add docs/superpowers/specs/2026-05-20-e2e-catalog-server-design.md
git commit -m "$(cat <<'EOF'
docs(specs): mark E2E catalog success criteria as completed

All v1 success criteria from the PRD verified end-to-end.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Notes for the Implementer

- **Symlink fragility** — Per `CLAUDE.md`, `pnpm install` can break `@eventualize/*` symlinks. If you see "separate declarations of a private property" errors after Task 1.1 or Task 5.4, re-run the symlink commands listed in `CLAUDE.md`.
- **Vite dev server is out of scope** — Iterate with `pnpm build:ui` (or `vite build --watch` in a second terminal). No HMR in v1.
- **OpenAPI 3.1 + AsyncAPI 3.0** — Do not downgrade to OpenAPI 3.0 or AsyncAPI 2.x. The renderers handle both, but the ownership/operation model in this design depends on AsyncAPI 3.0's `send`/`receive`.
- **Spec drift** — These are hand-written fragments. If you add a new HTTP route or async channel in a slice, also update the slice's `openapi.ts` / `asyncapi.ts` in the same commit. Future work: a lint rule that checks fragment coverage against Express routes.
- **Per CLAUDE.md** — A lint fix must never increase the build error count, and vice versa. Verify both counts after each task.
