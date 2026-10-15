# Replay Playground v3 — detection, new replay widgets

**Status:** Draft, for owner review
**Date:** 2026-10-14
**Branch:** `develop`
**Builds on:** [v1](2026-10-14-replay-playground-design.md), [v2](2026-10-14-replay-playground-v2-design.md)

---

## 1. Goal

Help the user find cause and effect in a stream. The playground can now detect
patterns: a risk jump, a risk rise or decline by X %, or a balance that crosses
a threshold. The server returns the offsets where each pattern starts. The UI
jumps to them with the match in the middle of the loaded page, and the user
steps through them with previous and next.

The replay pane also gets a cleaner layout. The slide animation and
`event_meta` go away. Two widgets at the top show the state at the offset
(balance, risk, stats) and how it changed from the previous offset.

### Success criteria

- `POST /api/accounts/:id/detect` returns the start offset of each run where
  the detector condition holds (edge-triggered), in ascending order.
- The offsets come from the same replay path the pane uses: `goToOffset` +
  `forward()`.
- After Detect, the UI shows the first match. The loaded page has the match in
  the middle, or as close to the middle as the stream bounds allow.
- Previous and next move between matches, and every move shows the match page
  centred.
- The "▶ view" jump from v2 never applies to a different account.

### Out of scope

- Detectors other than the five below, and combining detectors.
- Saving detections.
- Statistical anomaly models.
- Changes to `packages/*`, CI, or the deploy scripts.

---

## 2. Backend

### 2.1 `POST /api/accounts/:id/detect`

Body: `{ detector, params }`.

| `detector` | `params` | Condition at offset N |
|------------|----------|------------------------|
| `riskJump` | `jump`: number, 0 < jump ≤ 10, default 2.5 | `abs(risk[N] − risk[N−1]) ≥ jump` |
| `riskRise` | `percent`: number, 0 < p ≤ 1000; `window`: integer 1–1000, default 5 | `N ≥ w` and `(risk[N] − risk[N−w]) / max(risk[N−w], 0.5) × 100 ≥ percent` |
| `riskDecline` | same as `riskRise` | `N ≥ w` and `(risk[N−w] − risk[N]) / max(risk[N−w], 0.5) × 100 ≥ percent` |
| `balanceCrossUp` | `threshold`: finite number, abs ≤ 1e12 | `N ≥ 1` and `cents(balance[N−1]) < T ≤ cents(balance[N])` |
| `balanceCrossDown` | same | `N ≥ 1` and `cents(balance[N−1]) ≥ T > cents(balance[N])` |

**Edge-triggered:** offset N is a match when the condition is true at N and
false at N − 1 (or N is the first offset). The crossings and the risk jump
compare neighbouring events, so in practice each event can match once.

Response:

```json
{ "detector": "riskJump", "matches": [12, 40, 97], "scanned": 160, "lastOffset": 159, "truncated": false }
```

Limits:

- the scan stops after `MAX_SCAN = 20_000` events (from offset 0);
- at most `MAX_MATCHES = 1_000` matches are returned;
- `truncated` is true when either limit was hit.

Errors:

- unknown account → 404;
- missing or unknown `detector`, or a parameter missing, wrong type or out of
  range → 400;
- a parameter that does not belong to the detector → 400.

### 2.2 Code

| File | Role |
|------|------|
| `src/detection/series.ts` | `readSeries(storage, streamId, maxScan)` returns `{ points: { offset, balance, risk }[], lastOffset, truncated }`. It uses `goToOffset(id, 0, storage)` with no snapshot adapter, then `forward()` until `isHead` or `maxScan`. |
| `src/detection/detect.ts` | Pure: `detect(points, detector) → number[]`, plus the `Detector` union type. |
| `src/http/validation.ts` | `parseDetectBody(body: unknown): Detector` |
| `src/http/createApp.ts` | The route. It returns `{ detector, matches (capped), scanned, lastOffset, truncated }`. |

---

## 3. Frontend

### 3.1 Replay pane layout (top to bottom)

1. Title row: "Replay · {account}" and the ⚡/🌐 source badge.
2. **Two floating glass widgets, side by side:**
   - **Offset widget:**
     - a circular progress ring showing `offset / lastOffset`, with the offset
       in the centre;
     - the balance on the right;
     - the green-to-red risk meter below.
   - **Stats widget:** three counter tiles, each with a large count and a
     coloured border: ▲ deposits (green), ▼ withdrawals (accent), ⛔ denied
     (red).
   - Both widgets show ▲/▼ changes versus the previous offset (balance, risk,
     each counter), green for up and red for down. There is no change marker
     at offset 0, or when the value did not change.
3. **Event card:** `event_payload` as a key/value table (type, description,
   value, reason), followed by messages. No `event_meta`. It sits **above** the
   navigation panel.
4. **Navigation panel:**
   - page size, offset + Go, use snapshots;
   - the step buttons and the slider;
   - the timeline strip, with amber ▼ marks above matched bars;
   - the cache / server-fetch line.
5. **Detection card**, with a dashed amber border:
   - the detector dropdown;
   - the parameter inputs for the chosen detector;
   - 🔎 Detect;
   - the match navigator: ◀ prev / `match i / n · offset X` / next ▶;
   - "no matches" when the list is empty;
   - "truncated" when the server says so;
   - "results outdated — detect again" after `lastOffset` changes.
6. Navigation log (unchanged).

The slide animation and its CSS are removed.

### 3.2 Centred jump

`useReplayCursor` gets `goToCentered(offset)`:

- It **always** fetches a page, even when the offset is cached.
- The page start is
  `centeredStart(offset, pageSize, lastOffset) = clamp(offset − floor(pageSize / 2), 0, max(0, lastOffset − pageSize + 1))`.
- It records a move with the new reason `"match"`. The navigation log shows it
  as `🎯 match → 40 fetched 30–49`.

Detect (first match), previous and next all use `goToCentered`.

### 3.3 Detection state

`useDetection(accountId, lastOffset)` holds:

- the detector kind and its parameters;
- the matches, the current index, the status, `truncated` and `stale`.

`stale` becomes true when `lastOffset` changes after a detection. The matches
stay visible but are marked outdated.

### 3.4 v2 fix: "▶ view" jump

The jump request becomes `{ accountId, offset, nonce }`. ReplayPane applies it
only when `accountId` matches its own account.

### 3.5 Pure helpers (tested)

| Helper | Signature |
|--------|-----------|
| `centeredStart` | `centeredStart(offset, pageSize, lastOffset): number` |
| `stepMatch` | `stepMatch(index, delta, count): number`, clamped to 0..count−1 |
| `deltaOf` | `deltaOf(current, previous): { sign: 1 \| -1 \| 0; abs: number }`, cents-safe |
| `describeMove` | handles reason `"match"` |

---

## 4. Testing

**Backend:**

- `detect`:
  - each detector;
  - edge triggering (a run of true values gives one match);
  - the `window` boundary (no match before N = w);
  - the 0.5 floor;
  - crossing at the exact threshold value, in both directions;
  - an empty series.
- `readSeries`:
  - in-memory adapter; the points equal a manual fold;
  - `maxScan` sets `truncated`.
- HTTP:
  - each detector returns 200;
  - hostile bodies give 400: unknown detector, missing or extra params,
    `jump` 0 or 11, `window` 0 or 2.5, `percent` −1, `threshold` "x";
  - an unknown account gives 404.
- Postgres integration:
  - generate 5 `riskSpike`, then 20 `riskCoolDown` on a new account;
  - `riskJump` (jump 2.5) returns `[1]` (risk 3→6 at offset 1; offset 0 has
    no previous event);
  - `riskDecline` (percent 50, window 5) returns the first cool-down offset
    where the 5-event change reaches −50 %.
  - The test computes the expected offsets with `detect()` over a manual fold
    of the same events, and checks that they equal the HTTP result.

**Frontend:** `centeredStart`, `stepMatch`, `deltaOf`, and `describeMove`
for the match reason.

**Deploy:** `pnpm playground:deploy`. Scripted curl through nginx: generate
spike + cool-down events, call detect, then fetch the replay page centred on
the first match.

**Definition of done:**

- `pnpm build` and `pnpm exec eslint .` at 0 errors;
- `pnpm lint`;
- prettier on `apps/playground/**/*.{ts,tsx}`;
- frontend build;
- backend and frontend tests;
- root `pnpm test`;
- a successful deploy.
