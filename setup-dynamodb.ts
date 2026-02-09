import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createDynamoDBTables() {
    const dynamoClient = new DynamoDBClient({
        endpoint: "http://localhost:8000",
        credentials: {
            accessKeyId: "local",
            secretAccessKey: "local",
        },
        region: "us-east-1",
    });

    const tableSchemas = [
        "events-table-schema.json",
        "snapshots-table-schema.json",
        "messages-table-schema.json",
    ];

    for (const schemaFile of tableSchemas) {
        const schemaPath = path.join(__dirname, "packages/dynamodb-storage-adapter/models", schemaFile);
        const schemaData = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));

        try {
            await dynamoClient.send(new CreateTableCommand(schemaData));
            console.log(`✓ Created table: ${schemaData.TableName}`);
        } catch (error: any) {
            if (error.name === "ResourceInUseException") {
                console.log(`⚠ Table already exists: ${schemaData.TableName}`);
            } else {
                console.error(`✗ Error creating table ${schemaData.TableName}:`, error.message);
                throw error;
            }
        }
    }

    dynamoClient.destroy();
    console.log("\n✓ DynamoDB tables setup complete!");
}

createDynamoDBTables().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
