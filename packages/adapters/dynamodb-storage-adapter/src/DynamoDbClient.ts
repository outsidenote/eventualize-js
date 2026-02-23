import type { DynamoDBClientConfig } from "@aws-sdk/client-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

/**
 * Configuration options for DynamoDB client.
 * All properties are optional and fall back to environment variables if not provided.
 */
export interface DynamoDBClientOptions {
  endpoint?: string;
  accessKeyId?: string;

  secretAccessKey?: string;
  region?: string;
}

/**
 * Creates a DynamoDB client.
 * @param options - Optional configuration. Falls back to environment variables if not provided.
 */
export function createDynamoDBClient(options?: DynamoDBClientOptions): DynamoDBClient {
  const endpoint = options?.endpoint ?? process.env.DYNAMODB_CONNECTION;
  const accessKeyId = options?.accessKeyId ?? process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = options?.secretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY;
  const region = options?.region ?? process.env.AWS_REGION ?? "us-east-1";

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    const envVars = { endpoint, accessKeyId, secretAccessKey };
    throw new Error(
      "AWS credentials are not set in environment variables: " + JSON.stringify(envVars),
    );
  }

  const config: DynamoDBClientConfig = {};
  config.endpoint = endpoint;
  config.credentials = { accessKeyId, secretAccessKey };
  config.region = region;
  return new DynamoDBClient(config);
}
