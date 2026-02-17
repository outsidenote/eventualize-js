export function createAbortError(message: string = 'Aborted'): DOMException {
  return new DOMException(message, 'AbortError');
}

export function throwAbortError(message: string = 'Aborted'): never {
  throw createAbortError(message);
}

export function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throwAbortError();
  }
}
