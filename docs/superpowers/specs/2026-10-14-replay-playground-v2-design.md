# Replay Playground v2 — generator, page size, cache indicator, new UI

**Status:** Draft, for owner review
**Date:** 2026-10-14
**Branch:** `develop`
**Builds on:** [Replay Playground v1](2026-10-14-replay-playground-design.md)

---

## 1. Goal

Make the playground faster to drive and easier to read while checking replay:

- Generate many events in one click, with patterns that move balance and risk
  in a known way.
- Let the user pick the replay page size and see, on every move, whether the
  data came from the client cache or from the backend.
- Rework the UI: a two-page commands pane, a resizable split, and a new
  "Midnight glass" look with a timeline strip and a navigation log.

### Success criteria

- One generate request appends `count` events at consecutive offsets.
- Target balance ends exactly on the requested balance.
- `storeEvery: K` gives `ceil(count / K)` snapshot rows per view for the run.
- Replay with snapshots equals a full fold for every offset after a
  generate with `storeEvery > 1` (real Postgres).
- Every navigation shows ⚡ cache or 🌐 server, and the navigation log
  matches the real requests.
- The split ratio survives a page reload.

### Out of scope

- More themes or a theme switcher.
- A seed input in the UI.
- An "account frozen" rule.
- Timeline paging beyond the last 5,000 events.
- CI changes. Changes to `packages/*`.

---

## 2. Backend

### 2.1 `POST /api/accounts/:id/generate`

Body:

| Field | Type | Rule |
|-------|------|------|
| `count` | integer | 1–500, required |
| `pattern` | `"random" \| "riskSpike" \| "riskCoolDown" \| "targetBalance"` | required |
| `currency` | 3-letter code | optional. Default: the account currency, or `USD` for a new account. Must match the account currency. |
| `target` | `{ mode: "absolute" \| "percent", value: number }` | required for `targetBalance`, rejected for other patterns |
| `storeEvery` | integer | 1–`count`, default 1 |

Response: `{ fromOffset, toOffset, count, denied, views }`. `denied` is the
number of `WithdrawalDenied` events in the run.

### 2.2 Planner

`src/generator/planEvents.ts` is pure. For each step it takes the **current**
views and a random function `() => number` in `[0, 1)`, and returns an intent
`{ kind: "deposit" | "withdraw", value, description }`. The generator runs each
intent through the same decision rules as the manual commands (a withdraw
above the balance becomes `WithdrawalDenied`). Values are rounded to cents.

| Pattern | Step |
|---------|------|
| `random` | 50% deposit, 50% withdraw. Value 20–1,500; with 10% chance 10,000–40,000. Description `"random"`. |
| `riskSpike` | Deposit 10,000–40,000. Description `"risk spike"`. |
| `riskCoolDown` | Deposit 10–200. Description `"risk cool-down"`. |
| `targetBalance` | `goal` = `value` (absolute) or `balance × (1 + value / 100)` (percent), fixed at the start of the run. Step = remaining gap / remaining steps × (1 ± up to 0.3), rounded to cents; the last step is the exact remaining gap. Positive gap → deposit, negative → withdraw. Description `"target balance"`. Never denied. |

`targetBalance` is rejected with 400 when:

- `goal < 0`;
- `goal` equals the current balance;
- `|goal − balance| / count < 0.01`.

A jittered step never overshoots the goal: each step is clamped so the
remaining gap keeps its sign.

### 2.3 Generator execution

`src/generator/generate.ts`:

1. Load the stream once (`factory.get`).
2. Check the currency.
3. For each step: plan, decide, append. After every `storeEvery` appended
   events, and at the end, call `store()`.
4. Return the response.

`OCCException` gives 409. Events stored before the conflict stay stored; the
409 body says how many were stored.

### 2.4 `GET /api/accounts/:id/timeline`

Response: `{ lastOffset, events: [{ offset, eventType, value }] }`. Reads raw
events with `getEventsAsync` from `max(0, lastOffset − 4999)`. No views. 404
for an unknown account.

### 2.5 `GET /api/accounts` (changed)

Response: `{ accounts: [{ id, lastOffset, balance: { amount, currency }, risk }] }`,
sorted by id. Head state comes from `getHead` per account.

### 2.6 Unchanged

Replay endpoint, `batchSize` 1–200, deposit/withdraw, error mapping.

---

## 3. Frontend

### 3.1 Look ("Midnight glass")

Theme in CSS custom properties in `styles.css` (`--bg`, `--card`,
`--card-line`, `--text`, `--dim`, `--accent`, `--radius`, `--density`, …):

- dark, calm Midnight base; accent hue 211°; corner radius 16px; normal
  density; system sans-serif font;
- frosted-glass cards: translucent background, `backdrop-filter: blur(10px)`,
  thin light border.

No UI library, no new runtime dependency.

### 3.2 Layout

`SplitLayout`: commands left, replay right, a vertical drag handle between
them. Default left width 40%, clamped to 25–75%, saved in `localStorage` key
`evdb-playground.split`. The handle is focusable; ← / → move it by 2%.

### 3.3 Commands pane — two pages

1. **Account picker** (no account selected): avatar cards (initial, id,
   balance, risk) and a "create account" input.
2. **Account actions** (account selected):
   - "← Switch account" button: clears the selection; the replay pane returns
     to its empty state;
   - header: account id, balance, risk as `RiskMeter`;
   - Manual section: the existing deposit / withdraw form;
   - Generate section: count, pattern (🎲 random mix, 📈 risk spike,
     🧊 risk cool-down, 🎯 target balance), target mode (absolute / percent)
     and value (🎯 only), store every K events, Generate button. Shows the
     response (offsets, denied count) after a run.

### 3.4 Replay pane

- Page size input, 1–200, default 20. Changing it clears the cache.
- Offset + Go, step buttons (first, −10, −1, +1, +10, last), slider, ← / → keys.
- Source badge pill next to the title after every move: ⚡ cache (green) or
  🌐 server (amber).
- `RiskMeter` for risk: green-to-red gradient bar, 0–10.
- Event card slides in from the direction of travel (~250 ms). Disabled under
  `prefers-reduced-motion: reduce`.
- Timeline strip above the card: one bar per event from `/timeline`; color by
  event type; height by `log10(value)`; cached range highlighted; current
  offset outlined; click to jump.
- Navigation log: last 12 moves, for example `⚡ → 17 from cache`,
  `🌐 → 40 fetched 40–59`, `♻ page size → 50`.

### 3.5 `useReplayCursor` changes

- `pageSize` is a parameter (replaces the `BATCH_SIZE` constant).
- Each completed move creates a `Move`:
  `{ target, direction: -1 | 0 | 1, source: "cache" | "server", fetched?: { start, end }, reason: "nav" | "reload" | "pageSize" }`.
- A cached move records `source: "cache"`. A fetch records
  `source: "server"` only when the response arrives and passes the stale
  guard; a dropped response records nothing.
- Returns `lastMove` and `moves` (last 12).

### 3.6 Files

| File | Role |
|------|------|
| `layout/SplitLayout.tsx`, `layout/splitRatio.ts` | resizer; pure clamp / pointer math |
| `commands/AccountPicker.tsx`, `commands/AccountActions.tsx` | the two pages |
| `commands/ManualCommand.tsx`, `commands/Generator.tsx` | the two action sections |
| `replay/ReplayPane.tsx`, `replay/ReplayCard.tsx` | pane and card |
| `replay/Timeline.tsx`, `replay/timelineBars.ts` | strip; pure bar math |
| `replay/NavLog.tsx`, `replay/describeMove.ts` | log; pure move text |
| `ui/RiskMeter.tsx`, `ui/SourceBadge.tsx` | shared widgets |
| `useReplayCursor.ts`, `useTimeline.ts` | hooks |
| `api/types.ts`, `api/client.ts` | new DTOs and calls |

`CommandsPane.tsx` is replaced by the `commands/` files.

---

## 4. Testing

**Backend (node:test, in-memory adapter unless noted):**

- `planEvents` with a seeded random function: kinds and value ranges per
  pattern; spike reaches risk 10; cool-down reaches risk 0; random produces
  `WithdrawalDenied`; target balance absolute and percent, up and down, ends
  exactly on goal with no denials and no overshoot; the three 400 cases.
- `generate`: consecutive offsets; snapshot rows per view =
  `ceil(count / storeEvery)`; response totals; currency mismatch → 400.
- HTTP validation: count 0 / 501, unknown pattern, missing or extra `target`,
  `storeEvery` 0 or > `count`; `/timeline` and `/accounts` shapes; timeline
  404.
- Postgres integration: generate 60 random events with `storeEvery: 7`; for
  every offset and page sizes 1, 7, 20, replay with snapshots equals replay
  without snapshots equals the full fold.

**Frontend (node:test, pure modules):** `splitRatio`, `describeMove` (each
reason and source), `timelineBars`, `planMove` with page sizes 1, 7, 200.

**Manual:** badge ⚡ inside the window, 🌐 outside; page-size change logs ♻
and the next move is 🌐; split ratio survives reload; slide direction matches
the step; no animation under reduced motion.

**Deploy:** `pnpm playground:deploy`; scripted curl through nginx: generate 25
random events, `/timeline`, one replay batch.

**Definition of done:** `pnpm build` and `pnpm exec eslint .` at 0 errors;
`pnpm lint`; prettier on `apps/playground/**/*.{ts,tsx}`; frontend build;
backend and frontend tests; root `pnpm test`; successful deploy.
