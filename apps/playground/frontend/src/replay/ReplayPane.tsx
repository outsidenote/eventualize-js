import { useEffect, useMemo, useRef, useState } from "react";
import { useReplayCursor } from "../useReplayCursor";
import { useDetection } from "../useDetection";
import { useTimeline } from "../useTimeline";
import { SourceBadge } from "../ui/SourceBadge";
import { DetectionCard } from "./DetectionCard";
import { NavLog } from "./NavLog";
import { OffsetWidget } from "./OffsetWidget";
import { PayloadCard } from "./PayloadCard";
import { StatsWidget } from "./StatsWidget";
import { Timeline } from "./Timeline";

type Props = {
  readonly accountId: string | null;
  readonly lastOffset: number;
  readonly headLoading: boolean;
  readonly jump: {
    readonly accountId: string;
    readonly offset: number;
    readonly nonce: number;
  } | null;
};

function isTypingTarget(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement
  );
}

export function ReplayPane({ accountId, lastOffset, headLoading, jump }: Props) {
  const [snapshots, setSnapshots] = useState(true);
  const [offsetInput, setOffsetInput] = useState("0");
  const [pageSizeInput, setPageSizeInput] = useState("20");
  const [pageSize, setPageSize] = useState(20);
  const cursor = useReplayCursor(accountId, lastOffset, snapshots, pageSize);
  const timeline = useTimeline(accountId, lastOffset);
  const detection = useDetection(accountId, lastOffset);
  const matchSet = useMemo(() => new Set(detection.matches), [detection.matches]);
  const applyPageSize = () => {
    const n = Number(pageSizeInput);
    if (Number.isInteger(n) && n >= 1 && n <= 200) setPageSize(n);
    else setPageSizeInput(String(pageSize));
  };

  const appliedNonce = useRef<number | null>(null);
  const { goTo } = cursor;
  useEffect(() => {
    if (jump === null || jump.accountId !== accountId) return;
    if (appliedNonce.current === jump.nonce) return;
    if (lastOffset < jump.offset) return; // head not caught up yet; retry when it moves
    appliedNonce.current = jump.nonce;
    goTo(jump.offset);
  }, [jump, accountId, lastOffset, goTo]);

  useEffect(() => {
    setOffsetInput(String(cursor.target));
  }, [cursor.target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "ArrowLeft") cursor.goTo(cursor.target - 1);
      if (e.key === "ArrowRight") cursor.goTo(cursor.target + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor]);

  if (accountId === null) {
    return (
      <section className="pane">
        <h2>Replay</h2>
        <p>Select an account on the left.</p>
      </section>
    );
  }
  if (lastOffset < 0) {
    return (
      <section className="pane">
        <h2>Replay · {accountId}</h2>
        <p>{headLoading ? "Loading…" : "No events yet."}</p>
      </section>
    );
  }

  const step = (delta: number) => () => cursor.goTo(cursor.target + delta);
  const goToInput = () => {
    const n = Number(offsetInput);
    if (offsetInput.trim() !== "" && Number.isInteger(n)) cursor.goTo(n);
  };
  return (
    <section className="pane">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Replay · {accountId}</h2>
        <SourceBadge source={cursor.lastMove?.source ?? null} />
      </div>
      {cursor.item !== null ? (
        <>
          <div className="widgets">
            <OffsetWidget
              offset={cursor.item.offset}
              lastOffset={lastOffset}
              views={cursor.item.views}
              previous={cursor.previous?.views ?? null}
            />
            <StatsWidget
              stats={cursor.item.views.stats}
              previous={cursor.previous?.views.stats ?? null}
            />
          </div>
          <PayloadCard item={cursor.item} />
        </>
      ) : (
        <p>{cursor.loading ? "Loading…" : "No data"}</p>
      )}
      <div className="card">
        <h3>navigation</h3>
        <div className="row">
          <input
            type="number"
            min={0}
            max={lastOffset}
            value={offsetInput}
            onChange={(e) => setOffsetInput(e.target.value)}
          />
          <button className="primary" onClick={goToInput}>
            Go
          </button>
          <label>
            <input
              type="checkbox"
              checked={snapshots}
              onChange={(e) => setSnapshots(e.target.checked)}
            />{" "}
            use snapshots
          </label>
          <label>
            page size{" "}
            <input
              type="number"
              min={1}
              max={200}
              value={pageSizeInput}
              onChange={(e) => setPageSizeInput(e.target.value)}
              onBlur={applyPageSize}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyPageSize();
              }}
            />
          </label>
        </div>
        <div className="row">
          <button onClick={() => cursor.goTo(0)}>|◀</button>
          <button onClick={step(-10)}>◀◀ -10</button>
          <button onClick={step(-1)}>◀ -1</button>
          <button onClick={step(1)}>+1 ▶</button>
          <button onClick={step(10)}>+10 ▶▶</button>
          <button onClick={() => cursor.goTo(lastOffset)}>▶|</button>
        </div>
        <div className="row">
          <input
            type="range"
            min={0}
            max={lastOffset}
            value={cursor.target}
            onChange={(e) => cursor.goTo(Number(e.target.value))}
          />
          <span>
            {cursor.target} / {lastOffset}
          </span>
        </div>
        <Timeline
          events={timeline.events}
          lastOffset={lastOffset}
          current={cursor.target}
          cacheWindow={cursor.cacheWindow}
          matches={matchSet}
          onJump={cursor.goTo}
        />
        {timeline.error !== null && <p className="error">{timeline.error}</p>}
        {cursor.error !== null && <p className="error">{cursor.error}</p>}
        <p className="debug">
          cache:{" "}
          {cursor.cacheWindow === null
            ? "empty"
            : `offsets ${cursor.cacheWindow.start}–${cursor.cacheWindow.end}`}{" "}
          · server fetches: {cursor.fetchCount}
          {cursor.loading ? " · loading" : ""}
        </p>
      </div>
      <DetectionCard detection={detection} onMatch={cursor.goToCentered} />
      <NavLog moves={cursor.moves} />
    </section>
  );
}
