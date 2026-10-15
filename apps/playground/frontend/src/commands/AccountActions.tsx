import type { AccountHead } from "../api/types";
import { formatAmount } from "../format";
import { RiskMeter } from "../ui/RiskMeter";
import { Generator } from "./Generator";
import { ManualCommand } from "./ManualCommand";

type Props = {
  readonly accountId: string;
  readonly head: AccountHead | null;
  readonly headLoading: boolean;
  readonly onBack: () => void;
  readonly onDone: () => Promise<void>;
  readonly onJump: (offset: number) => void;
};

export function AccountActions({ accountId, head, headLoading, onBack, onDone, onJump }: Props) {
  const currency =
    head !== null && head.views.balance.currency !== "" ? head.views.balance.currency : null;
  return (
    <section className="pane">
      <div className="row between">
        <button className="ghost" onClick={onBack}>
          ← Switch account
        </button>
        <span className="dim">{head === null ? "" : `${head.lastOffset + 1} events`}</span>
      </div>
      <div className="card">
        <div className="row between">
          <span className="row" style={{ margin: 0 }}>
            <span className="avatar">{accountId.charAt(0).toUpperCase()}</span>
            <strong style={{ fontSize: 18 }}>{accountId}</strong>
          </span>
          <span className="big">
            {head === null
              ? headLoading
                ? "Loading…"
                : "new account"
              : formatAmount(head.views.balance.amount, head.views.balance.currency)}
          </span>
        </div>
        {head !== null && <RiskMeter risk={head.views.risk} />}
      </div>
      <ManualCommand
        accountId={accountId}
        defaultCurrency={currency ?? "USD"}
        disabled={headLoading}
        onDone={onDone}
      />
      <Generator accountId={accountId} currency={currency} onDone={onDone} onJump={onJump} />
    </section>
  );
}
