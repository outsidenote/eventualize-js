import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getHead, listAccounts } from "./api/client";
import type { AccountHead, AccountSummary } from "./api/types";
import { AccountActions } from "./commands/AccountActions";
import { AccountPicker } from "./commands/AccountPicker";
import { SplitLayout } from "./layout/SplitLayout";
import { ReplayPane } from "./replay/ReplayPane";

export function App() {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [head, setHead] = useState<AccountHead | null>(null);
  const [headLoading, setHeadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jump, setJump] = useState<{ accountId: string; offset: number; nonce: number } | null>(
    null,
  );
  const selectedRef = useRef<string | null>(null);

  const refreshAccounts = useCallback(async () => {
    setAccounts(await listAccounts());
    setError(null);
  }, []);

  const refreshHead = useCallback(async (id: string) => {
    try {
      const next = await getHead(id);
      if (next.streamId === selectedRef.current) setHead(next);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        if (id === selectedRef.current) setHead(null);
      } else throw e;
    }
  }, []);

  useEffect(() => {
    selectedRef.current = selected;
    setJump(null);
    setHead(null);
    setError(null);
    if (selected === null) {
      setHeadLoading(false);
      refreshAccounts().catch((e: Error) => setError(e.message));
      return;
    }
    setHeadLoading(true);
    refreshHead(selected)
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        if (selectedRef.current === selected) setHeadLoading(false);
      });
  }, [selected, refreshHead, refreshAccounts]);

  const onDone = useCallback(async () => {
    const id = selectedRef.current;
    if (id === null) return;
    await Promise.all([refreshHead(id), refreshAccounts()]);
  }, [refreshHead, refreshAccounts]);

  const requestJump = useCallback((offset: number) => {
    const accountId = selectedRef.current;
    if (accountId === null) return;
    setJump({ accountId, offset, nonce: Date.now() });
  }, []);

  const left =
    selected === null ? (
      <AccountPicker accounts={accounts} onSelect={setSelected} />
    ) : (
      <AccountActions
        key={selected}
        accountId={selected}
        head={head}
        headLoading={headLoading}
        onBack={() => setSelected(null)}
        onDone={onDone}
        onJump={requestJump}
      />
    );

  return (
    <div className="app">
      {error !== null && <p className="error banner">{error}</p>}
      <SplitLayout
        left={left}
        right={
          <ReplayPane
            key={selected ?? ""}
            accountId={selected}
            lastOffset={head?.lastOffset ?? -1}
            headLoading={headLoading}
            jump={jump}
          />
        }
      />
    </div>
  );
}
