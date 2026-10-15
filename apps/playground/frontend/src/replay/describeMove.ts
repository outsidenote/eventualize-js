import type { CacheWindow } from "../replayWindow";

export type MoveSource = "cache" | "server";
export type MoveReason = "nav" | "reload" | "pageSize" | "match";

/** One completed navigation, for the source badge, the slide direction and the log. */
export type Move = {
  readonly target: number;
  readonly direction: -1 | 0 | 1;
  readonly source: MoveSource;
  readonly reason: MoveReason;
  readonly pageSize: number;
  readonly fetched?: CacheWindow;
};

export function directionOf(from: number, to: number): -1 | 0 | 1 {
  return to > from ? 1 : to < from ? -1 : 0;
}

export function describeMove(m: Move): string {
  const prefix =
    m.reason === "pageSize" ? `♻ page size → ${m.pageSize} · ` : m.reason === "reload" ? "↻ " : "";
  const match = m.reason === "match";
  if (m.source === "cache") return `${match ? "🎯 match" : `${prefix}⚡`} → ${m.target} from cache`;
  const range = m.fetched ? ` fetched ${m.fetched.start}–${m.fetched.end}` : "";
  return `${match ? "🎯 match" : `${prefix}🌐`} → ${m.target}${range}`;
}
