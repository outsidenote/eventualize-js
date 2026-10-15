import { useState } from "react";
import { generate } from "../api/client";
import { errorText } from "../api/errorText";
import type { GeneratePattern, GenerateResult } from "../api/types";
import { formatAmount } from "../format";

const PATTERNS: ReadonlyArray<{ readonly value: GeneratePattern; readonly label: string }> = [
  { value: "random", label: "🎲 random mix" },
  { value: "riskSpike", label: "📈 risk spike" },
  { value: "riskCoolDown", label: "🧊 risk cool-down" },
  { value: "targetBalance", label: "🎯 target balance" },
];

function toPattern(v: string): GeneratePattern {
  return PATTERNS.find((p) => p.value === v)?.value ?? "random";
}

type Props = {
  readonly accountId: string;
  readonly currency: string | null;
  readonly onDone: () => Promise<void>;
  readonly onJump: (offset: number) => void;
};

export function Generator({ accountId, currency, onDone, onJump }: Props) {
  const [count, setCount] = useState("25");
  const [pattern, setPattern] = useState<GeneratePattern>("random");
  const [mode, setMode] = useState<"absolute" | "percent">("absolute");
  const [targetValue, setTargetValue] = useState("5000");
  const [storeEvery, setStoreEvery] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await generate(accountId, {
        count: Number(count),
        pattern,
        storeEvery: Number(storeEvery),
        ...(currency !== null ? { currency } : {}),
        ...(pattern === "targetBalance" ? { target: { mode, value: Number(targetValue) } } : {}),
      });
      setResult(r);
    } catch (e) {
      setError(errorText(e));
    } finally {
      // A 409 still stores part of the events, so always refresh.
      await onDone().catch(() => undefined);
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>Generate events</h3>
      <div className="row">
        <label>
          count{" "}
          <input
            type="number"
            min={1}
            max={500}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </label>
        <select value={pattern} onChange={(e) => setPattern(toPattern(e.target.value))}>
          {PATTERNS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {pattern === "targetBalance" && (
        <div className="row">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value === "percent" ? "percent" : "absolute")}
          >
            <option value="absolute">absolute balance</option>
            <option value="percent">percent of current</option>
          </select>
          <input
            type="number"
            step="any"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
          />
          <span className="dim">
            {mode === "percent" ? "e.g. -30 → 70% of balance" : "end balance"}
          </span>
        </div>
      )}
      <div className="row">
        <label>
          store every{" "}
          <input
            type="number"
            min={1}
            value={storeEvery}
            onChange={(e) => setStoreEvery(e.target.value)}
          />{" "}
          events
        </label>
        <span className="dim">(snapshot density)</span>
      </div>
      <button className="primary" disabled={busy} onClick={() => void run()}>
        ✨ Generate
      </button>
      {error !== null && <p className="error">{error}</p>}
      {result !== null && (
        <p className="dim">
          offsets {result.fromOffset}–{result.toOffset} · {result.denied} denied · balance{" "}
          {formatAmount(result.views.balance.amount, result.views.balance.currency)}{" "}
          <button className="ghost" onClick={() => onJump(result.fromOffset)}>
            ▶ view
          </button>
        </p>
      )}
    </div>
  );
}
