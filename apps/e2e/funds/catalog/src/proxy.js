import { createProxyMiddleware } from "http-proxy-middleware";
export function createCatalogProxy(services) {
    const byId = new Map(services.map((s) => [s.id, s]));
    return (req, res, next) => {
        // Path looks like: /funds-main/api/funds/deposit (serviceId + remainder)
        const match = req.url.match(/^\/([^/]+)(\/.*)?$/);
        if (!match) {
            res.status(404).json({ error: "proxy path missing service id" });
            return;
        }
        const [, serviceId, rest = "/"] = match;
        const svc = byId.get(serviceId);
        if (!svc) {
            res.status(404).json({ error: `unknown service: ${serviceId}` });
            return;
        }
        const middleware = createProxyMiddleware({
            target: svc.baseUrl,
            changeOrigin: true,
            pathRewrite: () => rest,
            logger: console,
        });
        middleware(req, res, next);
    };
}
//# sourceMappingURL=proxy.js.map