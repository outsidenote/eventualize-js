import type { ReplayTarget } from '../types.js';

export function getTargetOffset(target: ReplayTarget): number | null {
  return 'offset' in target ? target.offset : null;
}

export function getTargetTimestamp(target: ReplayTarget): Date | null {
  return 'timestamp' in target ? target.timestamp : null;
}
