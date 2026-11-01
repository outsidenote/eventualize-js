/** Where the state of a snapshot row comes from. */
export type EvDbStateRef =
  /** A full row stored at this offset. */
  | { readonly kind: "row"; readonly offset: number }
  /** The view's default state. */
  | { readonly kind: "default" };
