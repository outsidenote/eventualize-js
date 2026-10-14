# Replay Playground (local k8s)

**Status:** Draft, for owner review
**Date:** 2026-10-14
**Branch:** `develop`
**Builds on:** [Replay — `goToOffset`](2026-10-12-stream-replay-goto-offset-design.md), [docs/REPLAY.md](../../REPLAY.md)

---

## 1. Goal

Give the owner a graphical playground to check by hand that stream replay
(`goToOffset` + `IEvDbReadOnlyStream.forward()`) works. The playground runs in
the local Kubernetes cluster of Docker Desktop and is deployed with one pnpm
command.

The screen has two halves:

- **Left (commands):** pick an account (the stream id), send deposit and
  withdraw commands to the backend.
- **Right (replay):** go to an offset, step forward and backward. Show the raw
  event and the view states that the read-only stream returns at that offset.

### Success criteria

- `pnpm playground:deploy` on a machine with Docker Desktop k8s builds and
  deploys everything. The UI is then on `http://localhost:8080`.
- Events added on the left are visible on the right at the right offset.
- For any offset, stepping to it (forward or backward, any number of steps)
  shows the same event, views and messages as a direct "go to" that offset.
- Replay with snapshots and replay without snapshots return the same views.
- The client asks the server for a new batch only when it moves outside the
  batch it holds.

### Out of scope

- Authentication and authorization.
- More than one currency per account.
- Helm, ingress controllers, CI pipelines, any cluster other than
  `docker-desktop`.
- Changes to `packages/*` or to `apps/sample-app`.

---

## 2. Layout

```
apps/playground/
  backend/            package "playground-backend"  (Express, TS)
  frontend/           package "playground-frontend" (Vite + React, TS)
  k8s/                kustomize manifests
scripts/playground/
  deploy.sh
  destroy.sh
```

`pnpm-workspace.yaml` gets `apps/playground/*`. Internal dependencies use
`workspace:^`. Prisma packages use the exact pinned version (see `CLAUDE.md`).

---

## 3. Domain

Stream type: `playground-funds`. Stream id: the account name (for example
`alice`). The factory `PlaygroundFundsStreamFactory` is hand-written with
`StreamFactoryBuilder`. It does not reuse the sample-app factories.

### 3.1 Events

| Event | Payload |
|-------|---------|
| `FundsDeposited` | `{ description: string; value: number; currency: string }` |
| `FundsWithdrawn` | `{ description: string; value: number; currency: string }` |
| `WithdrawalDenied` | `{ description: string; value: number; currency: string; reason: string }` |

### 3.2 Views

All view states are plain objects or numbers (no `Map`), so they serialize to
JSON as they are. All handlers are pure: they return a new state and never
change the given state.

| View | State | Rules |
|------|-------|-------|
| `balance` | `{ amount: number; currency: string }`, default `{ amount: 0, currency: "" }` | Deposited: `+value`, sets `currency`. Withdrawn: `-value`. Denied: no change. |
| `stats` | `{ deposits: number; withdrawals: number; denied: number }` | +1 on the matching counter. |
| `risk` | `number` from 0 to 10, default 0 | +3 for any event with `value >= 10_000`. +2 for each `WithdrawalDenied`. −0.5 for each deposit with `value < 10_000`, never below 0. Result capped at 10. |

### 3.3 Messages

`withMessages` produces `LargeTransactionAlert` with
`{ eventType, value, currency, balanceAfter }` for any event with
`value >= 10_000`.

### 3.4 Command rules

- `value` must be a finite number greater than 0.
- `currency` is a 3-letter code. The account currency is the currency of the
  first deposit. A command in another currency is rejected (HTTP 400).
- **Deposit** always appends `FundsDeposited`.
- **Withdraw** appends `FundsWithdrawn` if `balance.amount >= value`.
  Otherwise it appends `WithdrawalDenied` with `reason: "insufficient funds"`.
  A withdraw on an account with no events also appends `WithdrawalDenied`.
- `description` is optional. The default is `"deposit"` or `"withdrawal"`.

### 3.5 Snapshots

The backend passes the Postgres adapter as both the stream adapter and the
snapshot adapter. `store()` saves view snapshots by the views' own policy, so
replay starts from real snapshots.

---

## 4. Backend API

Express on `PORT` (default 3000). Storage: `EvDbPrismaStorageAdapter` with
`EvDbPostgresPrismaClientFactory.create()` (reads `POSTGRES_CONNECTION`).

| Method | Path | Result |
|--------|------|--------|
| GET | `/api/health` | `{ status: "ok" }` |
| GET | `/api/accounts` | `{ accounts: string[] }`, sorted |
| GET | `/api/accounts/:id` | `{ streamId, lastOffset, views }` (head state) |
| POST | `/api/accounts/:id/deposit` | body `{ value, currency, description? }` → `{ offset, eventType, views }` |
| POST | `/api/accounts/:id/withdraw` | same body and result |
| GET | `/api/accounts/:id/replay?offset=N&batchSize=M&snapshots=true` | replay batch (4.1) |

`GET /api/accounts` uses a direct Prisma query
(`SELECT DISTINCT stream_id FROM events WHERE stream_type = 'playground-funds'`),
because the library has no list API. This query lives in one module
(`accounts/listAccounts.ts`).

### 4.1 Replay batch

Parameters:

- `offset`: integer ≥ 0, required.
- `batchSize`: integer 1–200, default 20.
- `snapshots`: `true` (default) or `false`. With `false`, no snapshot adapter
  is passed to `goToOffset`, so views fold from their defaults.

Algorithm:

1. `stream = await factory.goToOffset(id, offset, adapter, snapshots ? adapter : undefined)`.
2. Add an item for the current position.
3. While `items.length < batchSize` and not `stream.isHead`: `await stream.forward()`,
   then add an item.

Each item is built from a **deep copy** of the state at that step, because
`forward()` changes the same object.

```json
{
  "streamId": "alice",
  "lastOffset": 17,
  "isHead": false,
  "items": [
    {
      "offset": 2,
      "event_meta": {
        "eventType": "FundsDeposited",
        "capturedAt": "2026-10-14T10:00:00.000Z",
        "capturedBy": "playground-backend",
        "storedAt": "2026-10-14T10:00:00.010Z",
        "traceparent": null
      },
      "event_payload": { "description": "salary", "value": 100000, "currency": "USD" },
      "views": {
        "balance": { "amount": 100110, "currency": "USD" },
        "stats": { "deposits": 3, "withdrawals": 0, "denied": 0 },
        "risk": 3
      },
      "messages": [
        { "messageType": "LargeTransactionAlert", "payload": { "...": "..." } }
      ]
    }
  ]
}
```

`isHead` is the value after the last item. `event_meta` contains the stored
metadata fields that exist on `EvDbEvent`; a missing optional field is `null`.

### 4.2 Errors

| Case | Status |
|------|--------|
| Bad body or bad query parameter | 400 |
| Currency mismatch | 400 |
| Unknown account (no events) on GET head or replay | 404 |
| `goToOffset` throws `RangeError` (no event at offset) | 404 |
| `OCCException` on `store()` | 409 |
| Anything else | 500, logged with the stack |

Error body: `{ error: string }`.

### 4.3 Code layout

| Folder | Content |
|--------|---------|
| `src/domain/` | events, views, messages, `PlaygroundFundsStreamFactory` |
| `src/commands/` | `deposit.ts`, `withdraw.ts` (decide + append + store) |
| `src/replay/` | `replayBatch.ts` (read-only stream → DTO list) |
| `src/accounts/` | `listAccounts.ts` |
| `src/http/` | routes, input validation, error mapping |
| `src/server.ts` | wiring, start |

---

## 5. Frontend

Vite + React + TS, no UI library. Dev server proxies `/api` to
`http://localhost:3000`.

### 5.1 Left pane — commands

- Account picker: list from `GET /api/accounts`, plus a text field to start a
  new account.
- Head summary: last offset, balance, risk.
- Form: value, currency (default `USD`), description. Buttons: Deposit,
  Withdraw.
- Log of the last 20 command results (offset, event type, value, balance).

### 5.2 Right pane — replay

- Follows the account selected on the left.
- Controls: offset input + Go, first, −10, −1, +1, +10, last, slider
  `0..lastOffset`. Keys ← and → step −1 and +1.
- "Use snapshots" checkbox (default on).
- Card for the current offset: `event_meta`, `event_payload`, formatted views,
  messages. Each section can expand to raw JSON.
- Debug line: cached range and number of fetches since the last reset.

### 5.3 Batch cache (`useReplayCursor`)

The hook holds one window: the items of the last response, offsets
`[start, end]`. The window logic is a pure function so it can be unit-tested.

| Move to `target` | Action |
|------------------|--------|
| `start <= target <= end` | Show from cache. No request. |
| `target > end` | Fetch `offset = target`. |
| `target < start` | Fetch `offset = max(0, target - batchSize + 1)`. |
| `target > lastOffset` or `target < 0` | Clamp; no request if the clamped value is cached. |

The cache is cleared when the account changes, the snapshot checkbox changes,
or a command succeeds for the selected account. A command also refreshes
`lastOffset`.

---

## 6. Kubernetes

Kustomize in `apps/playground/k8s/`, namespace `evdb-playground`.

| Resource | Details |
|----------|---------|
| `postgres` | StatefulSet, `postgres:18`, 1Gi PVC, Secret with user/password/db, ClusterIP Service `postgres:5432` |
| `migrate` | Job with the backend image. Waits until Postgres accepts connections, then runs `prisma migrate deploy` against the `postgres-storage-adapter` schema. Safe to re-run. |
| `backend` | Deployment, 1 replica, ClusterIP Service `backend:3000`. Readiness and liveness on `/api/health`. An initContainer waits until the schema exists. `POSTGRES_CONNECTION` from the Secret. |
| `frontend` | Deployment with nginx, Service type `LoadBalancer`, port 8080 (Docker Desktop maps it to `localhost:8080`). |

Images: `evdb-playground-backend:local`, `evdb-playground-frontend:local`,
`imagePullPolicy: Never`. Docker Desktop k8s uses the host image store, so no
registry is needed.

### 6.1 Dockerfiles

Build context is the repo root, because `@eventualize/*` packages resolve from
the workspace. A `.dockerignore` excludes `node_modules`, `dist`, `.env*`,
`.git`.

- **Backend:** multi-stage. Stage 1: `pnpm install --frozen-lockfile`, build
  the needed workspace packages, `pnpm deploy --filter playground-backend --prod /out`.
  Stage 2: `node:24-slim` with `/out` and the Prisma schema + migrations.
- **Frontend:** stage 1: Vite build. Stage 2: `nginx:alpine` with `nginx.conf`
  (serve static files, SPA fallback to `index.html`, proxy `/api/` to
  `http://backend:3000`).

---

## 7. Scripts

Root `package.json`:

| Script | Action |
|--------|--------|
| `playground:deploy` | `bash scripts/playground/deploy.sh` |
| `playground:destroy` | `bash scripts/playground/destroy.sh` |
| `playground:dev` | backend with `tsx watch` + Vite dev server, against the root `docker-compose` Postgres |

`deploy.sh` (`set -euo pipefail`):

1. Abort unless `kubectl config current-context` is `docker-desktop`.
2. `docker build` both images.
3. `kubectl apply -k apps/playground/k8s`.
4. Delete the old `migrate` Job if it exists, apply it again, wait for it to
   complete.
5. `kubectl rollout restart` the backend and frontend, then
   `kubectl rollout status` (with a timeout).
6. Smoke check: `curl -fsS http://localhost:8080/api/health`.
7. Print `http://localhost:8080`.

`destroy.sh` runs the same context check, then
`kubectl delete namespace evdb-playground`. This deletes the stored data.

---

## 8. Testing

Tests use `node:test` with `tsx`, like the rest of the repo.

**Unit (backend):**

- View handlers and the risk rules, including the cap and the floor.
- Deposit and withdraw decisions: denied on low balance, denied on empty
  account, currency mismatch.
- `replayBatch` with an in-memory adapter: batch length, stop at head,
  `isHead`, no shared references between items, same output with and without
  snapshots.

**Unit (frontend):** the pure window function from 5.3, all table rows.

**Integration (backend):** `src/tests/api.integration.test.ts`, testcontainers
Postgres. Deposit, withdraw, denied withdraw, large deposit. Then replay from
several offsets with several batch sizes. Each item must equal a full fold of
the events up to that offset. Covered by the root `test:integration` glob.

**Manual:** the deploy smoke check, then the UI.

**Definition of done:** `pnpm build`, `pnpm exec eslint .` and `pnpm test`
pass, with build and lint error counts not above the baseline (see
`CLAUDE.md`). `pnpm playground:deploy` succeeds and the UI works on
`localhost:8080`.
