import type { CatalogServiceDescriptor } from "./catalogConfig.js";

export interface FetchOptions {
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly totalTimeoutMs: number;
  readonly fetchImpl?: typeof fetch;
}

export const DEFAULT_FETCH_OPTIONS: FetchOptions = {
  initialDelayMs: 200,
  maxDelayMs: 5000,
  totalTimeoutMs: 30_000,
};

export type ServiceStatus = "online" | "offline" | "partial";

export interface ServiceSpecResult {
  readonly id: string;
  readonly displayName: string;
  readonly baseUrl: string;
  readonly status: ServiceStatus;
  readonly openapi: unknown | null;
  readonly asyncapi: unknown | null;
  readonly fetchedAt: string;
  readonly error?: string;
}

async function retryFetchJson(
  url: string,
  opts: FetchOptions,
): Promise<unknown> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const startedAt = Date.now();
  let delay = opts.initialDelayMs;
  let lastErr: unknown = null;
  while (Date.now() - startedAt < opts.totalTimeoutMs) {
    try {
      const res = await fetchImpl(url);
      if (res.ok) {
        return await res.json();
      }
      lastErr = new Error(`HTTP ${res.status} from ${url}`);
    } catch (err) {
      lastErr = err;
    }
    if (Date.now() - startedAt + delay > opts.totalTimeoutMs) break;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(opts.maxDelayMs, delay * 2);
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchServiceSpecs(
  svc: CatalogServiceDescriptor,
  opts: FetchOptions = DEFAULT_FETCH_OPTIONS,
): Promise<ServiceSpecResult> {
  const openApiUrl = `${svc.baseUrl}${svc.openApiPath ?? "/openapi.json"}`;
  const asyncApiUrl = `${svc.baseUrl}${svc.asyncApiPath ?? "/asyncapi.json"}`;

  const [openApiSettled, asyncApiSettled] = await Promise.allSettled([
    retryFetchJson(openApiUrl, opts),
    retryFetchJson(asyncApiUrl, opts),
  ]);

  const openapi = openApiSettled.status === "fulfilled" ? openApiSettled.value : null;
  const asyncapi = asyncApiSettled.status === "fulfilled" ? asyncApiSettled.value : null;

  let status: ServiceStatus;
  if (openapi && asyncapi) status = "online";
  else if (!openapi && !asyncapi) status = "offline";
  else status = "partial";

  const errors: string[] = [];
  if (openApiSettled.status === "rejected") errors.push(`openapi: ${String(openApiSettled.reason)}`);
  if (asyncApiSettled.status === "rejected") errors.push(`asyncapi: ${String(asyncApiSettled.reason)}`);

  return {
    id: svc.id,
    displayName: svc.displayName,
    baseUrl: svc.baseUrl,
    status,
    openapi,
    asyncapi,
    fetchedAt: new Date().toISOString(),
    ...(errors.length ? { error: errors.join("; ") } : {}),
  };
}
