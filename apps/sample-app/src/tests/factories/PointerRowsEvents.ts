// Events for PointerRowsStreamFactory (test-only).
export type Started = { readonly at: number };
export type Ticked = { readonly n: number };
export type Ended = { readonly at: number };

export type RareState = { readonly started: boolean; readonly ended: boolean };
export type CountState = { readonly count: number };
