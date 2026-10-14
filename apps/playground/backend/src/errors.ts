import OCCException from "@eventualize/types/primitives/OCCException";

/** Bad client input. Maps to HTTP 400. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Unknown account or offset. Maps to HTTP 404. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Concurrent write. Maps to HTTP 409. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** True for an optimistic-concurrency collision. The name check covers a second copy of @eventualize/types, where instanceof fails. */
export function isOccConflict(err: unknown): boolean {
  return err instanceof OCCException || (err instanceof Error && err.name === "OCCException");
}
