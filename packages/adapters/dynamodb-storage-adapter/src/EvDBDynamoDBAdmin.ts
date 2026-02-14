import { AttributeValue, BatchWriteItemCommand, DynamoDBClient, ScanCommand, WriteRequest } from "@aws-sdk/client-dynamodb";
import IEvDbStorageAdmin from "@eventualize/types/IEvDbStorageAdmin";
import { createDynamoDBClient, DynamoDBClientOptions } from "./DynamoDbClient.js";

export default class EvDbDynamoDbAdmin implements IEvDbStorageAdmin {
    private dynamoDbClient: DynamoDBClient
    /**
     * Creates a DynamoDB admin instance.
     * @param options - Optional DynamoDB client configuration. Falls back to env vars if not provided.
     */
    constructor(options?: DynamoDBClientOptions) {
        this.dynamoDbClient = createDynamoDBClient(options);
    }

    // Helper function to extract keys in raw DynamoDB format
    private extractKeys(tableName: string, items: Record<string, AttributeValue>[]): WriteRequest[] {
        return items.map(item => {
            const deleteRequest: WriteRequest = {
                DeleteRequest: {
                    Key: {} // Must build the Key object manually
                }
            };

            if (tableName === "events") {
                deleteRequest.DeleteRequest!.Key!["stream_address"] = item["stream_address"];
                deleteRequest.DeleteRequest!.Key!["offset"] = item["offset"];
            } else if (tableName === "snapshots") {
                deleteRequest.DeleteRequest!.Key!["view_address"] = item["view_address"];
                deleteRequest.DeleteRequest!.Key!["offset"] = item["offset"];
            } else if (tableName === "messages") {
                // Assuming the schema typo was fixed to message_address
                deleteRequest.DeleteRequest!.Key!["message_address"] = item["message_address"];
                deleteRequest.DeleteRequest!.Key!["captured_at"] = item["captured_at"];
            }

            return deleteRequest;
        });
    }

    /**
    * Scans a table for all items and deletes them in batches of 25.
    * @param tableName The name of the table to clear.
    */
    private async clearTableItems(tableName: string): Promise<void> {
        let items;
        let exclusiveStartKey: Record<string, AttributeValue> | undefined = undefined;
        const BATCH_SIZE = 25;

        do {
            // Define ProjectionExpression and ExpressionAttributeNames dynamically
            let projectionExpression: string;
            let expressionAttributeNames: Record<string, string> | undefined = undefined;

            if (tableName === "events") {
                projectionExpression = "stream_address, #o";
                expressionAttributeNames = { "#o": "offset" };
            } else if (tableName === "snapshots") {
                projectionExpression = "view_address, #o";
                expressionAttributeNames = { "#o": "offset" };
            } else { // "messages" table
                projectionExpression = "message_address, captured_at";
                // No offset in the projection for messages table, so no #o alias is needed
            }

            const scanCommand: ScanCommand = new ScanCommand({
                TableName: tableName,
                ProjectionExpression: projectionExpression,
                ExpressionAttributeNames: expressionAttributeNames, // Pass the dynamic object

                Limit: BATCH_SIZE,
                ExclusiveStartKey: exclusiveStartKey,
            });

            // ... (rest of the function for scanning and batch writing remains the same) ...
            const scanResult = await this.dynamoDbClient.send(scanCommand);
            items = scanResult.Items;

            if (items && items.length > 0) {
                const deleteRequests = this.extractKeys(tableName, items);

                const batchWriteCommand = new BatchWriteItemCommand({
                    RequestItems: {
                        [tableName]: deleteRequests
                    }
                });
                await this.dynamoDbClient.send(batchWriteCommand);
                console.log(`Deleted ${items.length} items from ${tableName}.`);
            }

            exclusiveStartKey = scanResult.LastEvaluatedKey;

        } while (exclusiveStartKey);

        console.log(`Finished item deletion for table: ${tableName}`);
    }

    createEnvironmentAsync(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    destroyEnvironmentAsync(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    public async clearEnvironmentAsync(): Promise<void> {
        await this.clearTableItems("events");
        await this.clearTableItems("snapshots");
        await this.clearTableItems("messages");
    }
    dispose?(): void {
        throw new Error("Method not implemented.");
    }
    disposeAsync(): Promise<void> {
        throw new Error("Method not implemented.");
    }

    public async close(): Promise<void> {
        return;
    }

}