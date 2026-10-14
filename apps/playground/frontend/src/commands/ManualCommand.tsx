import { useEffect, useState } from "react";
import { deposit, withdraw } from "../api/client";
import { errorText } from "../api/errorText";
import type { CommandResult } from "../api/types";
import { formatAmount } from "../format";
import { cents } from "../money";

const LOG_SIZE = 20;
type LogEntry = CommandResult & { readonly value: number };

type Props = {
  readonly accountId: string;
  readonly defaultCurrency: string;
  readonly disabled: boolean;
  readonly onDone: () => Promise<void>;
};

export function ManualCommand({ accountId, defaultCurrency, disabled, onDone }: Props) {
  const [value, setValue] = useState("100");
  const [currency, setCurrency] = useState(defaultCurrency);
  // The head (and so the account currency) loads after mount; follow it.
  useEffect(() => {
    setCurrency(defaultCurrency);
  }, [defaultCurrency]);
  const [description, setDescription] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(kind: "deposit" | "withdraw") {
    setBusy(true);
    setError(null);
    try {
      const input = {
        value: Number(value),
        currency,
        ...(description.trim() === "" ? {} : { description: description.trim() }),
      };
      const result =
        kind === "deposit" ? await deposit(accountId, input) : await withdraw(accountId, input);
      setLog((prev) => [{ ...result, value: cents(input.value) }, ...prev].slice(0, LOG_SIZE));
      await onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>Manual command</h3>
      <div className="row">
        <label>
          value{" "}
          <input
            type="number"
            min="0"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <label>
          currency{" "}
          <input
            value={currency}
            maxLength={3}
            style={{ width: 64 }}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          />
        </label>
      </div>
      <div className="row">
        <input
          placeholder="description (optional)"
          style={{ flex: 1 }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="row">
        <button className="primary" disabled={busy || disabled} onClick={() => void run("deposit")}>
          ▲ Deposit
        </button>
        <button className="danger" disabled={busy || disabled} onClick={() => void run("withdraw")}>
          ▼ Withdraw
        </button>
      </div>
      {error !== null && <p className="error">{error}</p>}
      {log.length > 0 && (
        <div className="navlog">
          {log.map((l) => (
            <div key={l.offset}>
              #{l.offset} {l.eventType} {l.value} →{" "}
              {formatAmount(l.views.balance.amount, l.views.balance.currency)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
