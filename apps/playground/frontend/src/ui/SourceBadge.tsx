import type { MoveSource } from "../replay/describeMove";

export function SourceBadge({ source }: { readonly source: MoveSource | null }) {
  if (source === null) return null;
  return (
    <span className={`badge badge-${source}`}>{source === "cache" ? "⚡ cache" : "🌐 server"}</span>
  );
}
