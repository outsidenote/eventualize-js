import { ApiError } from "./client";

export function errorText(e: unknown): string {
  if (e instanceof ApiError && e.status === 409) return "Concurrent write, please retry";
  return e instanceof Error ? e.message : String(e);
}
