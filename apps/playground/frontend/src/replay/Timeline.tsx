import { useEffect, useRef } from "react";
import type { TimelineEntry } from "../api/types";
import type { CacheWindow } from "../replayWindow";
import { barHeight, barKind, inWindow } from "./timelineBars";

type Props = {
  readonly events: readonly TimelineEntry[];
  readonly current: number;
  readonly lastOffset: number;
  readonly cacheWindow: CacheWindow | null;
  readonly matches: ReadonlySet<number>;
  readonly onJump: (offset: number) => void;
};

export function Timeline({ events, current, lastOffset, cacheWindow, matches, onJump }: Props) {
  const currentBar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    currentBar.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);
  if (events.length === 0) return null;
  return (
    <>
      {events[0].offset > 0 && (
        <p className="dim">
          showing last {events.length} of {lastOffset + 1} events
        </p>
      )}
      <div className="timeline" role="toolbar" aria-label="event timeline">
        {events.map((e) => (
          <button
            key={e.offset}
            ref={e.offset === current ? currentBar : null}
            type="button"
            tabIndex={e.offset === current ? 0 : -1}
            aria-label={`offset ${e.offset} ${e.eventType}${matches.has(e.offset) ? ", match" : ""}`}
            aria-current={e.offset === current ? "true" : undefined}
            title={`#${e.offset} ${e.eventType} ${e.value}`}
            className={`bar bar-${barKind(e.eventType)}${inWindow(e.offset, cacheWindow) ? " cached" : ""}${e.offset === current ? " current" : ""}`}
            style={{ height: `${barHeight(e.value)}%` }}
            onClick={() => onJump(e.offset)}
          >
            {matches.has(e.offset) && <i className="match-mark" aria-hidden="true" />}
          </button>
        ))}
      </div>
    </>
  );
}
