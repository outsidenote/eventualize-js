import type { EvDbStateRef } from "./EvDbStateRef.js";

/** The payload of a snapshot row: the state itself, or a pointer to the state. */
export type EvDbSnapshotBody =
  | { readonly kind: "full"; readonly state: unknown }
  | { readonly kind: "pointer"; readonly stateRef: EvDbStateRef };
