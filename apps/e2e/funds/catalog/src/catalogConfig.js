export const fundsCatalogConfig = {
    appName: "funds e2e",
    port: Number(process.env.CATALOG_PORT ?? 3099),
    services: [
        {
            id: "funds-main",
            displayName: "Funds Main",
            baseUrl: process.env.FUNDS_MAIN_URL ?? "http://localhost:3014",
        },
        {
            id: "funds-risk",
            displayName: "Funds Risk",
            baseUrl: process.env.FUNDS_RISK_URL ?? "http://localhost:3013",
        },
    ],
};
//# sourceMappingURL=catalogConfig.js.map