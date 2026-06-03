import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fundsCatalogConfig } from "./catalogConfig.js";
import { fetchServiceSpecs, DEFAULT_FETCH_OPTIONS } from "./specFetcher.js";
import { createCatalogProxy } from "./proxy.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const uiDist = join(__dirname, "..", "dist", "ui");
async function refreshAllSpecs(config) {
    return Promise.all(config.services.map((svc) => fetchServiceSpecs(svc, DEFAULT_FETCH_OPTIONS).catch((err) => ({
        id: svc.id,
        displayName: svc.displayName,
        baseUrl: svc.baseUrl,
        status: "offline",
        openapi: null,
        asyncapi: null,
        fetchedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
    }))));
}
async function main() {
    const config = fundsCatalogConfig;
    const state = { config, services: [], lastRefreshAt: null };
    void (async () => {
        console.log("[catalog] fetching specs from", config.services.map((s) => s.baseUrl).join(", "));
        state.services = await refreshAllSpecs(config);
        state.lastRefreshAt = new Date().toISOString();
        for (const s of state.services) {
            console.log(`[catalog] ${s.id}: ${s.status}${s.error ? ` (${s.error})` : ""}`);
        }
    })();
    const app = express();
    app.use(express.json());
    app.get("/health", (_req, res) => res.json({ status: "ok", service: "funds-catalog" }));
    app.get("/api/specs", (_req, res) => {
        res.json({
            appName: config.appName,
            lastRefreshAt: state.lastRefreshAt,
            services: state.services,
        });
    });
    app.post("/api/specs/refresh", async (_req, res) => {
        state.services = await refreshAllSpecs(config);
        state.lastRefreshAt = new Date().toISOString();
        res.json({ ok: true, lastRefreshAt: state.lastRefreshAt });
    });
    app.use("/api/proxy", createCatalogProxy(config.services));
    if (existsSync(uiDist)) {
        app.use(express.static(uiDist));
        app.get("*", (_req, res) => res.sendFile(join(uiDist, "index.html")));
    }
    else {
        app.get("/", (_req, res) => res.status(503).send(`<h1>Catalog UI not built</h1><p>Run <code>pnpm --filter e2e-funds-catalog build:ui</code> to build the UI, or use the JSON API at <a href="/api/specs">/api/specs</a>.</p>`));
    }
    const server = createServer(app);
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, resolve);
    });
    console.log(`[catalog] running at http://localhost:${config.port}`);
    const shutdown = (signal) => {
        console.log(`[catalog] ${signal} received`);
        server.close(() => process.exit(0));
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
}
main().catch((err) => {
    console.error("[catalog] startup failed:", err);
    process.exit(1);
});
//# sourceMappingURL=server.js.map