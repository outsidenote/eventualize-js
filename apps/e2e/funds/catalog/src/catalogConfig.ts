export interface CatalogServiceDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly baseUrl: string;
  readonly openApiPath?: string;   // default: "/openapi.json"
  readonly asyncApiPath?: string;  // default: "/asyncapi.json"
}

export interface CatalogConfig {
  readonly appName: string;
  readonly port: number;
  readonly services: ReadonlyArray<CatalogServiceDescriptor>;
}

export const fundsCatalogConfig: CatalogConfig = {
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
