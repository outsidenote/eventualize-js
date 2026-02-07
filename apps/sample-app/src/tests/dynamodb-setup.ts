import { DynamoDBClient, CreateTableCommand, CreateTableCommandInput } from "@aws-sdk/client-dynamodb";
import { DynamoDBConfig } from "./test-containers.js";

// Table schemas embedded to avoid file system dependencies in tests
const EVENTS_TABLE_SCHEMA: CreateTableCommandInput = {
    TableName: "events",
    AttributeDefinitions: [
        { AttributeName: "stream_address", AttributeType: "S" },
        { AttributeName: "offset", AttributeType: "N" },
        { AttributeName: "event_type", AttributeType: "S" },
        { AttributeName: "captured_at", AttributeType: "S" }
    ],
    KeySchema: [
        { AttributeName: "stream_address", KeyType: "HASH" },
        { AttributeName: "offset", KeyType: "RANGE" }
    ],
    BillingMode: "PAY_PER_REQUEST",
    GlobalSecondaryIndexes: [
        {
            IndexName: "event_type__captured_at",
            KeySchema: [
                { AttributeName: "event_type", KeyType: "HASH" },
                { AttributeName: "captured_at", KeyType: "RANGE" }
            ],
            Projection: { ProjectionType: "ALL" }
        }
    ]
};

const SNAPSHOTS_TABLE_SCHEMA: CreateTableCommandInput = {
    TableName: "snapshots",
    AttributeDefinitions: [
        { AttributeName: "view_address", AttributeType: "S" },
        { AttributeName: "offset", AttributeType: "N" }
    ],
    KeySchema: [
        { AttributeName: "view_address", KeyType: "HASH" },
        { AttributeName: "offset", KeyType: "RANGE" }
    ],
    BillingMode: "PAY_PER_REQUEST"
};

const MESSAGES_TABLE_SCHEMA: CreateTableCommandInput = {
    TableName: "messages",
    AttributeDefinitions: [
        { AttributeName: "message_address", AttributeType: "S" },
        { AttributeName: "captured_at", AttributeType: "S" }
    ],
    KeySchema: [
        { AttributeName: "message_address", KeyType: "HASH" },
        { AttributeName: "captured_at", KeyType: "RANGE" }
    ],
    BillingMode: "PAY_PER_REQUEST"
};

/**
 * Creates all required DynamoDB tables for the event store.
 * @param config - DynamoDB connection configuration from LocalStack container
 */
export async function setupDynamoDBTables(config: DynamoDBConfig): Promise<void> {
    const dynamoClient = new DynamoDBClient({
        endpoint: config.endpoint,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
        region: config.region,
    });

    const tableSchemas = [
        EVENTS_TABLE_SCHEMA,
        SNAPSHOTS_TABLE_SCHEMA,
        MESSAGES_TABLE_SCHEMA,
    ];

    for (const schema of tableSchemas) {
        try {
            await dynamoClient.send(new CreateTableCommand(schema));
            console.log(`✓ Created DynamoDB table: ${schema.TableName}`);
        } catch (error: any) {
            if (error.name === "ResourceInUseException") {
                console.log(`⚠ Table already exists: ${schema.TableName}`);
            } else {
                console.error(`✗ Error creating table ${schema.TableName}:`, error.message);
                throw error;
            }
        }
    }

    dynamoClient.destroy();
    console.log("✓ DynamoDB tables setup complete!");
}
