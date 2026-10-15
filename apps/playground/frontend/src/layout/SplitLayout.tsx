import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import {
  clampRatio,
  parseStoredRatio,
  ratioFromPointer,
  SPLIT_MAX,
  SPLIT_MIN,
  SPLIT_STEP,
  SPLIT_STORAGE_KEY,
} from "./splitRatio";

export function SplitLayout({
  left,
  right,
}: {
  readonly left: ReactNode;
  readonly right: ReactNode;
}) {
  const [ratio, setRatio] = useState(() =>
    parseStoredRatio(localStorage.getItem(SPLIT_STORAGE_KEY)),
  );
  const [dragging, setDragging] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(SPLIT_STORAGE_KEY, String(ratio));
  }, [ratio]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = container.current;
    if (!dragging || box === null) return;
    const r = box.getBoundingClientRect();
    setRatio(ratioFromPointer(e.clientX, r.left, r.width));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  };
  // ←/→ move the split; stop them reaching the replay pane's window key handler.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    e.stopPropagation();
    setRatio((r) => clampRatio(r + (e.key === "ArrowLeft" ? -SPLIT_STEP : SPLIT_STEP)));
  };

  return (
    <div className="split" ref={container} style={{ gridTemplateColumns: `${ratio}% 8px 1fr` }}>
      <div className="split-pane">{left}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panes"
        aria-valuemin={SPLIT_MIN}
        aria-valuemax={SPLIT_MAX}
        aria-valuenow={ratio}
        tabIndex={0}
        className={`resizer${dragging ? " dragging" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDragging(false)}
        onLostPointerCapture={() => setDragging(false)}
        onKeyDown={onKeyDown}
      />
      <div className="split-pane">{right}</div>
    </div>
  );
}
