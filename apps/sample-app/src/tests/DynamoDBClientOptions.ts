/** DynamoDB client configuration options for test injection */

export interface DynamoDBClientOptions {
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
}
