import { useEffect, useState } from "react";
import { timeline } from "./api/client";
import type { TimelineEntry } from "./api/types";

/** Raw event summaries for the timeline strip; reloads whenever the head offset changes. */
export function useTimeline(
  accountId: string | null,
  lastOffset: number,
): { readonly events: readonly TimelineEntry[]; readonly error: string | null } {
  const [events, setEvents] = useState<readonly TimelineEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (accountId === null || lastOffset < 0) {
      setEvents([]);
      setError(null);
      return;
    }
    setError(null);
    timeline(accountId)
      .then((t) => {
        if (!active) return;
        setEvents(t.events);
        setError(null);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [accountId, lastOffset]);

  return { events, error };
}
