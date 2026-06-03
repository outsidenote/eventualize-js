export interface CatalogServiceDescriptor {
    readonly id: string;
    readonly displayName: string;
    readonly baseUrl: string;
    readonly openApiPath?: string;
    readonly asyncApiPath?: string;
}
export interface CatalogConfig {
    readonly appName: string;
    readonly port: number;
    readonly services: ReadonlyArray<CatalogServiceDescriptor>;
}
export declare const fundsCatalogConfig: CatalogConfig;
