# Replay Playground

A local playground to check stream replay (`goToOffset` + `forward`) by hand.
Left half: send deposit / withdraw commands to an account. Right half: go to
any offset of that account and step forward or backward. Each step shows the
stored event, the view states (`balance`, `stats`, `risk`) and the recomputed
outbox messages at that offset.

## Run in Kubernetes (Docker Desktop)

Needs Docker Desktop with Kubernetes on, and the kubectl context `docker-desktop`.

```bash
pnpm playground:deploy    # build images, deploy, wait, smoke check
open http://localhost:8080
pnpm playground:destroy   # delete the namespace and all its data
```

Run `pnpm build` once first; workspace packages resolve from `dist/`.

The frontend Service is a LoadBalancer on port 8080 with an unauthenticated write API. On Docker Desktop it may be reachable from the LAN, so use it for local use only.

Deploy imports the images into the Docker Desktop node container. `ErrImageNeverPull` means that step did not run.

## Run locally without Kubernetes

```bash
pnpm playground:dev       # Postgres from docker-compose, backend :3000, UI :5173
```

Run `pnpm build` once first; workspace packages resolve from `dist/`.

## What to check

- Stepping to an offset gives the same card as typing the offset and pressing Go.
- "use snapshots" on and off give the same views.
- The "fetches" counter grows only when you leave the cached range.
- The ⚡/🌐 badge and the navigation log match where data came from; after a page-size change the log shows ♻.
- Detect jumps to a centred page: the log shows `🎯 match → X fetched S–E`, and prev/next step through the matches.
- Results become "outdated" after new events; run Detect again.
- ▲/▼ deltas need the previous event in the loaded page. At page size 200 the first item of a page has none.
- `storeEvery` controls snapshot density. A larger value means fewer snapshots, so replay has to fold from older snapshots.

## API

| Method | Path |
|--------|------|
| GET | `/api/health` |
| GET | `/api/accounts` — `{ accounts: [{ id, lastOffset, balance: { amount, currency }, risk }] }` |
| GET | `/api/accounts/:id` |
| POST | `/api/accounts/:id/deposit` — `{ value, currency, description? }` |
| POST | `/api/accounts/:id/withdraw` — same body |
| POST | `/api/accounts/:id/generate` — `{ count, pattern, currency?, target?, storeEvery? }`. `pattern` is one of `random`, `riskSpike`, `riskCoolDown`, `targetBalance`. `count` is 1–500. `storeEvery` is 1–count (default 1). `target` is `{ mode: "absolute" \| "percent", value }`; it is required for `targetBalance` and rejected otherwise. `currency` defaults to the account currency (USD for a new account). |
| GET | `/api/accounts/:id/timeline` — last 5,000 events: `{ lastOffset, events: [{ offset, eventType, value }] }` |
| POST | `/api/accounts/:id/detect` — `{ detector, params }`. Returns `{ detector, matches, scanned, lastOffset, truncated }`. See "Detectors" below. |
| GET | `/api/accounts/:id/replay?offset=N&batchSize=M&snapshots=true` |

## Detectors

| Detector | Params |
|----------|--------|
| `riskJump` | `jump` in (0, 10], default 2.5 |
| `riskRise` | `percent` in (0, 1000] (required), `window` integer 1–1000, default 5 |
| `riskDecline` | `percent` in (0, 1000] (required), `window` integer 1–1000, default 5 |
| `balanceCrossUp` | `threshold`: finite number, \|t\| ≤ 1e12, rounded to cents |
| `balanceCrossDown` | `threshold`: same as above |

- Edge-triggered: only the start offset of each run is returned. Offset 0 never matches (no previous event).
- Limits: scans at most 20,000 events and returns at most 1,000 matches. `truncated` flags either limit.

Design: [docs/superpowers/specs/2026-10-14-replay-playground-design.md](../../docs/superpowers/specs/2026-10-14-replay-playground-design.md)
