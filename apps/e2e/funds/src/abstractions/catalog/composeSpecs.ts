import type { OpenAPIV3_1 } from "openapi-types";
import type { AsyncApiFragment } from "#BusinessCapabilities/Funds/swimlanes/Funds/asyncapi.js";

export interface ComposeOpenApiArgs {
  title: string;
  version: string;
  description?: string;
  paths: OpenAPIV3_1.PathsObject[];
}

export function composeOpenApi(args: ComposeOpenApiArgs): OpenAPIV3_1.Document {
  return {
    openapi: "3.1.0",
    info: { title: args.title, version: args.version, description: args.description },
    paths: Object.assign({}, ...args.paths),
  };
}

export interface ComposeAsyncApiArgs {
  title: string;
  version: string;
  description?: string;
  fragments: AsyncApiFragment[];
}

export function composeAsyncApi(args: ComposeAsyncApiArgs): Record<string, unknown> {
  const channels: Record<string, unknown> = {};
  const operations: Record<string, unknown> = {};
  const messages: Record<string, unknown> = {};
  const schemas: Record<string, unknown> = {};

  for (const f of args.fragments) {
    Object.assign(channels, f.channels ?? {});
    Object.assign(operations, f.operations ?? {});
    Object.assign(messages, f.components?.messages ?? {});
    Object.assign(schemas, f.components?.schemas ?? {});
  }

  return {
    asyncapi: "3.0.0",
    info: { title: args.title, version: args.version, description: args.description },
    channels,
    operations,
    components: { messages, schemas },
  };
}
