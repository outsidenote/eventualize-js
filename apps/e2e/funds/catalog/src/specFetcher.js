export const DEFAULT_FETCH_OPTIONS = {
    initialDelayMs: 200,
    maxDelayMs: 5000,
    totalTimeoutMs: 30000,
};
async function retryFetchJson(url, opts) {
    const fetchImpl = opts.fetchImpl ?? fetch;
    const startedAt = Date.now();
    let delay = opts.initialDelayMs;
    let lastErr = null;
    while (Date.now() - startedAt < opts.totalTimeoutMs) {
        try {
            const res = await fetchImpl(url);
            if (res.ok) {
                return await res.json();
            }
            lastErr = new Error(`HTTP ${res.status} from ${url}`);
        }
        catch (err) {
            lastErr = err;
        }
        if (Date.now() - startedAt + delay > opts.totalTimeoutMs)
            break;
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(opts.maxDelayMs, delay * 2);
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
export async function fetchServiceSpecs(svc, opts = DEFAULT_FETCH_OPTIONS) {
    const openApiUrl = `${svc.baseUrl}${svc.openApiPath ?? "/openapi.json"}`;
    const asyncApiUrl = `${svc.baseUrl}${svc.asyncApiPath ?? "/asyncapi.json"}`;
    const [openApiSettled, asyncApiSettled] = await Promise.allSettled([
        retryFetchJson(openApiUrl, opts),
        retryFetchJson(asyncApiUrl, opts),
    ]);
    const openapi = openApiSettled.status === "fulfilled" ? openApiSettled.value : null;
    const asyncapi = asyncApiSettled.status === "fulfilled" ? asyncApiSettled.value : null;
    let status;
    if (openapi && asyncapi)
        status = "online";
    else if (!openapi && !asyncapi)
        status = "offline";
    else
        status = "partial";
    const errors = [];
    if (openApiSettled.status === "rejected")
        errors.push(`openapi: ${String(openApiSettled.reason)}`);
    if (asyncApiSettled.status === "rejected")
        errors.push(`asyncapi: ${String(asyncApiSettled.reason)}`);
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
//# sourceMappingURL=specFetcher.js.map