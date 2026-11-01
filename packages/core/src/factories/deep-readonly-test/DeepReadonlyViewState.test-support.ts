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
