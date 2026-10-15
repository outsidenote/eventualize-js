import { useState } from "react";
import type { AccountSummary } from "../api/types";
import { formatAmount } from "../format";

const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,64}$/;

type Props = {
  readonly accounts: readonly AccountSummary[];
  readonly onSelect: (id: string) => void;
};

export function AccountPicker({ accounts, onSelect }: Props) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function create() {
    const name = newName.trim();
    if (!ACCOUNT_ID.test(name)) {
      setError("Account name: 1-64 letters, digits, '-' or '_'");
      return;
    }
    onSelect(name);
  }

  return (
    <section className="pane">
      <h2>Choose an account</h2>
      <div className="row">
        <input
          placeholder="new account name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") create();
          }}
        />
        <button className="primary" onClick={create}>
          + Create
        </button>
      </div>
      {error !== null && <p className="error">{error}</p>}
      {accounts.length === 0 && <p className="dim">No accounts yet. Create one to start.</p>}
      <div className="accounts">
        {accounts.map((a) => (
          <button key={a.id} className="card account" onClick={() => onSelect(a.id)}>
            <span className="avatar">{a.id.charAt(0).toUpperCase()}</span>
            <span>
              <strong className="block">{a.id}</strong>
              <span className="dim block">
                {formatAmount(a.balance.amount, a.balance.currency)} · risk {a.risk} ·{" "}
                {a.lastOffset + 1} events
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
