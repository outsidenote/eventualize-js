export interface InitialCheckpoint<TState> {
  state: TState;
  index: number;
}

export interface EventIndexEntry {
  seq: number;
  offset: number;
  timestamp: Date;
}
