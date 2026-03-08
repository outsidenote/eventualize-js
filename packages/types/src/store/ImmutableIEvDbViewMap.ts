import type ImmutableIEvDbView from "./ImmutableIEvDbView.js";

/** A read-only map of view names to their immutable view snapshots. */
export type ImmutableIEvDbViewMap = Readonly<Record<string, ImmutableIEvDbView>>;
