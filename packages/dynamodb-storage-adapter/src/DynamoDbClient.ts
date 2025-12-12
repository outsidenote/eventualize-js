// src/dynamo-client.ts
import { DynamoDBClient, DynamoDBClientConfig } from "@aws-sdk/client-dynamodb";

function createDynamoDBClient(): DynamoDBClient {
    const config: DynamoDBClientConfig = {};
    config.endpoint = process.env.DYNAMODB_URL;
    return new DynamoDBClient(config);
}

const dynamoClient = createDynamoDBClient();

// Export the client for use in other parts of your application
export default dynamoClient;
