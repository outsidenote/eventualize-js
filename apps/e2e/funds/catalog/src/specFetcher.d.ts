import type { CatalogServiceDescriptor } from "./catalogConfig.js";
export interface FetchOptions {
    readonly initialDelayMs: number;
    readonly maxDelayMs: number;
    readonly totalTimeoutMs: number;
    readonly fetchImpl?: typeof fetch;
}
export declare const DEFAULT_FETCH_OPTIONS: FetchOptions;
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
export declare function fetchServiceSpecs(svc: CatalogServiceDescriptor, opts?: FetchOptions): Promise<ServiceSpecResult>;
