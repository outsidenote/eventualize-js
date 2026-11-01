export interface Added {
  value: number;
}

export interface ViewState {
  count: number;
  items: number[];
  nested: { flag: boolean };
  tags: Map<string, number>;
}

export const defaultState: ViewState = {
  count: 0,
  items: [],
  nested: { flag: false },
  tags: new Map<string, number>(),
};

export interface RichViewState {
  ids: Set<number>;
  pair: [string, number];
  meta: { list: number[] };
  grid: number[][];
}

export const richDefaultState: RichViewState = {
  ids: new Set<number>(),
  pair: ["a", 1],
  meta: { list: [] },
  grid: [[1]],
};
