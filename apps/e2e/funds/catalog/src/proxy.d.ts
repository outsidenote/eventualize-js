import type { RequestHandler } from "express";
import type { CatalogServiceDescriptor } from "./catalogConfig.js";
export declare function createCatalogProxy(services: ReadonlyArray<CatalogServiceDescriptor>): RequestHandler;
