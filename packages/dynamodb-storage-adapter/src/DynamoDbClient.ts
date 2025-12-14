// src/dynamo-client.ts
import { DynamoDBClient, DynamoDBClientConfig, ListTablesCommand } from "@aws-sdk/client-dynamodb";

export async function listTables(client: DynamoDBClient) {
    try {
        const command = new ListTablesCommand({});
        const response = await client.send(command);
        console.log("Tables in DynamoDB Local:", response.TableNames);
        return response.TableNames;
    } catch (error) {
        console.error("Error listing tables:", error);
        throw error;
    }
}

export function createDynamoDBClient(): DynamoDBClient {
    const endpoint = process.env.DYNAMODB_URL;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || 'us-east-1';

    if (!endpoint || !accessKeyId || !secretAccessKey) {
        const envVars = { endpoint, accessKeyId, secretAccessKey };
        throw new Error("AWS credentials are not set in environment variables: " + JSON.stringify(envVars));
    }

    const config: DynamoDBClientConfig = {};
    config.endpoint = endpoint;
    config.credentials = { accessKeyId, secretAccessKey };
    config.region = region;
    return new DynamoDBClient(config);
}
