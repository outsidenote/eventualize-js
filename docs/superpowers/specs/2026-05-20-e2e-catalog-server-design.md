# E2E Service Catalog — Product Requirements Document

**Status:** Draft v1
**Version:** 1.0
**Date:** 2026-05-20
**Author:** bnaya@liquidity.com

---

## Executive Summary

Add an interactive **service catalog** to each e2e app (starting with `apps/e2e/funds`) that documents and exposes all REST endpoints and async event channels in a single Swagger-style web UI. The catalog runs as a dedicated process alongside the existing business servers, fetches OpenAPI 3.1 and AsyncAPI 3.0 specs from each service at startup, and renders them in a unified Vite-built React SPA.

**Key Principles:**

1. **Sidecar process, not embedded** — Catalog is its own server (`:3099`). Business servers are unaware of it beyond exposing spec endpoints.
2. **Spec ownership follows the channel role** — REST endpoints are owned by the server that handles them. Async channels: broadcast producers own `send`; point-to-point consumers own `receive`.
3. **Document-only async** — No publishing or live streaming from the UI. REST endpoints have full "Try it out"; async channels are read-only documentation.
4. **Standard tooling end-to-end** — `swagger-ui-react`, `@asyncapi/react-component`, OpenAPI 3.1, AsyncAPI 3.0. No custom doc formats.
5. **Slice-aligned spec composition** — Each business slice exports its own OpenAPI/AsyncAPI fragments; servers aggregate at startup.

---

## Problem Statement

### Current State

- The `apps/e2e/funds` app runs two Express servers (`funds-main :3014`, `funds-risk :3013`) with REST endpoints and several async flows (Kafka via Debezium CDC, pg-boss queues).
- Endpoints are only discoverable by reading the source code (`server.ts`, `risk-server.ts`).
- Async channels (`funds.outbox` Kafka topic, `pgboss/leaderboard-update` queue) are only documented in code comments and the swimlanes folder.
- Testing the app requires hand-crafting `curl` commands and remembering ports, paths, and payload shapes.

### Impact

- High onboarding cost for new contributors exploring the e2e samples.
- No single source of truth for service contracts.
- Async architecture (the most distinctive part of the eventualize-js story) is invisible without reading the code.
- Demos and walkthroughs lack a visual artifact that shows the system topology.

### Why This Matters Now

The e2e apps are the primary learning surface for eventualize-js. They demonstrate the slice + outbox + CDC + view-model pattern. A catalog UI makes that pattern immediately legible.

---

## Goals & Success Criteria

### Primary Goals

1. **Unified catalog UI per e2e app** — One URL (`http://localhost:3099`) shows every REST endpoint and async channel in the app.
2. **Interactive REST** — Swagger UI "Try it out" works against all REST endpoints, with CORS handled transparently via catalog-server proxy.
3. **Read-only async documentation** — All async channels render with schemas, payload examples, bindings (Kafka topic name, pg-boss queue name), and flow direction.
4. **Correct ownership** — Each server documents only the channels it owns according to the broadcast/point-to-point rule.
5. **Zero coupling to business code** — Catalog can be removed by deleting its directory; no business code depends on it.
6. **Reusable across future e2e apps** — `CatalogConfig` interface and slice-spec composition pattern work for any e2e app that follows the slice convention.

### Success Criteria

- [ ] `GET http://localhost:3099/` renders a Swagger + AsyncAPI UI listing all funds endpoints and channels.
- [ ] Each REST endpoint shows method, path, request schema, response schema, and a working "Try it out" button.
- [ ] Each async channel shows transport (kafka/pgboss), channel name, message schema, and operation (`send` or `receive`).
- [ ] `funds-main :3014` exposes `GET /openapi.json` (REST) and `GET /asyncapi.json` (outbox send + pgboss receive).
- [ ] `funds-risk :3013` exposes `GET /openapi.json` (REST) and `GET /asyncapi.json` (Kafka receive).
- [ ] Catalog server tolerates one or more upstream servers being temporarily unreachable.
- [ ] Service health (up/down) is visible in the catalog UI header.
- [ ] `POST /api/specs/refresh` re-fetches specs without restart.
- [ ] No `cors` middleware or business changes are required on the API servers — the catalog proxies "Try it out" requests.
- [ ] Build and lint counts unchanged from baseline (per `CLAUDE.md` rules).

### Non-Goals

- No production deployment of the catalog (it's a dev/demo tool).
- No async message publishing or live stream tailing from the UI (deferred — could become v2).
- No authentication or multi-user support.
- No code generation from specs (deferred).
- No catalog for the `sample-app` (only `e2e/funds` initially; pattern should extend).

---

## Architecture

### Process Topology

```
apps/e2e/funds/src/index.ts (orchestrator)
   ├─ spawns funds-main      :3014   GET /openapi.json | GET /asyncapi.json
   ├─ spawns funds-risk      :3013   GET /openapi.json | GET /asyncapi.json
   └─ spawns catalog-server  :3099   GET /             (Vite SPA)
                                     GET /api/specs    (aggregated)
                                     POST /api/specs/refresh
                                     /api/proxy/:service/*  (CORS proxy)
```

### Data Flow

```
                          ┌─────────────────────┐
                          │  catalog-server     │
                          │  :3099              │
                          └─────────────────────┘
                              │              ▲
              startup fetch   │              │ browser fetches
              (with retry)    │              │ /api/specs
                              ▼              │
       ┌──────────────────────────────┐      │
       │ funds-main :3014             │      │
       │  GET /openapi.json           │      │
       │  GET /asyncapi.json          │      │
       └──────────────────────────────┘      │
       ┌──────────────────────────────┐      │
       │ funds-risk :3013             │      │
       │  GET /openapi.json           │      │
       │  GET /asyncapi.json          │      │
       └──────────────────────────────┘      │
                                             │
                                  ┌──────────┴──────────┐
                                  │  browser            │
                                  │  swagger-ui-react   │
                                  │  @asyncapi/react... │
                                  └─────────────────────┘
                                       │
                       "Try it out"    │  goes through
                       calls           ▼  /api/proxy/funds-main/*
                                  catalog-server proxy → :3014 / :3013
```

### Repository Layout

```
apps/e2e/funds/
├── catalog/                         NEW
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── server.ts                Express server, /api/specs, /api/proxy
│       ├── catalogConfig.ts         CatalogConfig (services, ports)
│       ├── specFetcher.ts           Retry-with-backoff spec fetcher
│       ├── proxy.ts                 CORS-bypass proxy middleware
│       ├── main.tsx                 React entry
│       └── App.tsx                  Swagger UI + AsyncAPI panels + health
│
└── src/
    ├── server.ts                    UPDATED: mounts /openapi.json + /asyncapi.json
    ├── risk-server.ts               UPDATED: mounts /openapi.json + /asyncapi.json
    ├── index.ts                     UPDATED: spawns catalog-server
    └── BusinessCapabilities/Funds/slices/
        ├── DepositFunds/
        │   ├── openapi.ts           NEW: OpenAPI fragment for POST /api/funds/deposit
        │   └── ...
        ├── WithdrawFunds/openapi.ts NEW
        ├── AccountLeaderboard/
        │   ├── openapi.ts           NEW: GET /api/funds/leaderboard, POST /update
        │   ├── asyncapi.ts          NEW: pgboss receive (P2P consumer)
        │   └── ...
        └── RiskAssessment/
            ├── openapi.ts           NEW: GET /api/risk/:accountId, POST /update
            ├── asyncapi.ts          NEW: kafka receive (subscriber)
            └── ...
    └── BusinessCapabilities/Funds/swimlanes/Funds/
        └── asyncapi.ts              NEW: kafka send (FundsChanged broadcast producer)
```

---

## Component Design

### 1. Slice-Aligned Spec Composition

Each slice owns its OpenAPI path fragment (if it exposes HTTP) and AsyncAPI channel fragment (if it produces or consumes async messages).

**Example — `DepositFunds/openapi.ts`:**

```typescript
import type { OpenAPIV3_1 } from "openapi-types";

export const depositFundsOpenApi: OpenAPIV3_1.PathsObject = {
  "/api/funds/deposit": {
    post: {
      summary: "Deposit funds into an account",
      tags: ["Funds"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["accountId", "amount", "currency"],
              properties: {
                accountId: { type: "string" },
                amount: { type: "number", minimum: 0 },
                currency: { type: "string", example: "USD" },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Deposit recorded" },
        "400": { description: "Validation error" },
      },
    },
  },
};
```

**Example — `swimlanes/Funds/asyncapi.ts` (broadcast producer, `send`):**

```typescript
import type { AsyncAPIObject } from "@asyncapi/parser";

export const fundsOutboxAsyncApi: Partial<AsyncAPIObject> = {
  channels: {
    "funds.outbox": {
      address: "funds.outbox",
      messages: { FundsChanged: { $ref: "#/components/messages/FundsChanged" } },
      bindings: { kafka: { topic: "funds.outbox" } },
    },
  },
  operations: {
    publishFundsChanged: {
      action: "send",
      channel: { $ref: "#/channels/funds.outbox" },
    },
  },
  components: {
    messages: {
      FundsChanged: {
        payload: {
          type: "object",
          properties: {
            accountId: { type: "string" },
            delta: { type: "number" },
            currency: { type: "string" },
            currentBalance: { type: "number" },
            transactionId: { type: "string" },
          },
        },
      },
    },
  },
};
```

**Example — `AccountLeaderboard/asyncapi.ts` (P2P consumer, `receive`):**

```typescript
export const leaderboardAsyncApi: Partial<AsyncAPIObject> = {
  channels: {
    "pgboss/leaderboard-update": {
      address: "leaderboard-update",
      messages: { LeaderboardUpdateJob: { /* schema */ } },
      bindings: {
        // Custom binding for pg-boss (no official binding exists)
        "x-pgboss": { queue: "leaderboard-update" },
      },
    },
  },
  operations: {
    receiveLeaderboardUpdate: {
      action: "receive",
      channel: { $ref: "#/channels/pgboss/leaderboard-update" },
    },
  },
};
```

### 2. Per-Server Spec Aggregation

Each Express server adds two endpoints by composing its slice fragments:

```typescript
// server.ts additions
import { depositFundsOpenApi } from "#BusinessCapabilities/.../DepositFunds/openapi.js";
import { withdrawFundsOpenApi } from "#BusinessCapabilities/.../WithdrawFunds/openapi.js";
import { leaderboardOpenApi } from "#BusinessCapabilities/.../AccountLeaderboard/openapi.js";
import { fundsOutboxAsyncApi } from "#BusinessCapabilities/.../swimlanes/Funds/asyncapi.js";
import { leaderboardAsyncApi } from "#BusinessCapabilities/.../AccountLeaderboard/asyncapi.js";

app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.1.0",
    info: { title: "funds-main", version: "1.0.0" },
    paths: { ...depositFundsOpenApi, ...withdrawFundsOpenApi, ...leaderboardOpenApi },
  });
});

app.get("/asyncapi.json", (_req, res) => {
  res.json(mergeAsyncApi([fundsOutboxAsyncApi, leaderboardAsyncApi], {
    asyncapi: "3.0.0",
    info: { title: "funds-main async", version: "1.0.0" },
  }));
});
```

### 3. Catalog Server (`catalog/src/server.ts`)

An Express server with three responsibilities:

- **`GET /api/specs`** — Returns aggregated specs from all configured services. Cached in memory; refreshed via `POST /api/specs/refresh` or at startup.
- **`/api/proxy/:service/*`** — Generic reverse proxy. Swagger UI's `requestInterceptor` rewrites URLs to go through this proxy, eliminating CORS.
- **`GET /*`** — Serves the Vite-built static SPA from `dist/`.

**`CatalogConfig` interface (for reusability):**

```typescript
export interface CatalogServiceDescriptor {
  id: string;            // "funds-main"
  displayName: string;   // "Funds Main Server"
  baseUrl: string;       // "http://localhost:3014"
  openApiPath?: string;  // default "/openapi.json"
  asyncApiPath?: string; // default "/asyncapi.json"
}

export interface CatalogConfig {
  appName: string;
  port: number;
  services: CatalogServiceDescriptor[];
}
```

### 4. Spec Fetcher with Resilience

`specFetcher.ts` fetches each service's specs with exponential backoff (initial 200ms, max 5s, up to 30s total). A service that never responds is marked `status: "offline"` but does not block startup.

### 5. UI (`catalog/src/App.tsx`)

Single-page React app structured as:

- **Header bar** — App name, service health indicators (green dot if `/api/specs` lists it as up).
- **Tab navigation** — One tab per service (`funds-main`, `funds-risk`).
- **REST section** (`swagger-ui-react`) — Standard Swagger UI, with `requestInterceptor` rewriting `Try it out` URLs through `/api/proxy/:serviceId/*`.
- **Async section** (`@asyncapi/react-component`) — Renders the AsyncAPI spec inline below the REST section. Operations show with clear `send` / `receive` badges.

### 6. Orchestrator Update (`src/index.ts`)

Add a third entry to the `servers` array:

```typescript
{ name: "catalog", file: join(__dirname, "../catalog/src/server.ts"), color: "\x1b[33m" }
```

The orchestrator continues to use `tsx` for transpilation. The catalog server itself serves the `vite build` output from `catalog/dist/`.

---

## Build & Dev Workflow

- **Build:** `pnpm --filter @e2e/funds-catalog build` runs `vite build` (UI) and `tsc` (server).
- **Dev:** `pnpm dev` (existing orchestrator) starts all three servers via `tsx`. UI is served from pre-built `catalog/dist/` — fast iterations require running `vite build --watch` in a separate terminal. (Vite dev server with HMR is out of scope for v1; can be added later as a `--dev` flag on the catalog server.)
- **Production:** N/A — catalog is dev-only. README clearly states this.

---

## Dependencies

New dev/runtime dependencies added under `apps/e2e/funds/catalog/`:

| Package | Purpose |
|---|---|
| `express` | Already in repo |
| `http-proxy-middleware` | CORS-bypass proxy |
| `swagger-ui-react` | REST documentation UI |
| `@asyncapi/react-component` | AsyncAPI documentation UI |
| `react`, `react-dom` | UI framework |
| `vite`, `@vitejs/plugin-react` | Build tool |
| `openapi-types` (dev) | TypeScript types for OpenAPI 3.1 |
| `@asyncapi/parser` (dev) | TypeScript types for AsyncAPI 3.0 |

No new dependencies on `funds-main` or `funds-risk` — they only need the type packages (already dev deps) to author the spec fragments.

---

## Best-Practices Checklist

- ✅ **OpenAPI 3.1** (latest, JSON Schema 2020-12 compatible)
- ✅ **AsyncAPI 3.0** with `send`/`receive` operations (replaces ambiguous 2.x `publish`/`subscribe`)
- ✅ **Spec ownership rule:** producer owns broadcast, consumer owns point-to-point
- ✅ **Standard renderers** (`swagger-ui-react`, `@asyncapi/react-component`) — no custom doc formats
- ✅ **CORS handled via proxy** — no business-server changes for dev tooling
- ✅ **Startup resilience** — retry-with-backoff, graceful degradation
- ✅ **Slice-aligned composition** — specs live with the code they describe
- ✅ **Health visibility** — UI shows which services are reachable
- ✅ **Reusable contract** (`CatalogConfig`) — extracts cleanly to a shared package later
- ✅ **Dev-only** — no production exposure surface

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Spec drift between code and OpenAPI fragments | Hand-written fragments live next to the slice handler; PR review catches divergence. Consider adding lint rule later. |
| `swagger-ui-react` bundle size (~2MB) | Acceptable for a dev-only tool. Can switch to Scalar later if needed. |
| pg-boss has no official AsyncAPI binding | Use `x-pgboss` custom binding extension. AsyncAPI renderers gracefully ignore unknown bindings. |
| Catalog server start fails if other servers slow to boot | Retry-with-backoff in `specFetcher`; partial specs render with offline markers. |
| Future e2e apps copy-paste the catalog dir | Acceptable for v1; promote to `@eventualize/dev-catalog` package when a second e2e app needs it. |

---

## Open Questions

None at this time. All design decisions are committed in this document.

---

## Out of Scope (Deferred)

- Live event stream viewer
- Publishing test messages from the UI
- AsyncAPI Studio editor embed
- Authentication / multi-user
- Spec linting / drift detection in CI
- Extraction to `@eventualize/dev-catalog` shared package
- Catalog for `sample-app`

These may be reconsidered in a v2 PRD once v1 is in use.
