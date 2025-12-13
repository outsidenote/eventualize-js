import IEvDbEventPayload, { IEvDbPayloadData } from "@eventualize/types/IEvDbEventPayload"
import { AttributeValue, GetItemCommandInput, QueryCommand, QueryCommandInput, TransactWriteItem } from "@aws-sdk/client-dynamodb";
import EvDbStreamCursor from "@eventualize/types/EvDbStreamCursor";
import EvDbStreamAddress from "@eventualize/types/EvDbStreamAddress";
import EvDbEvent from "@eventualize/types/EvDbEvent";

export class EventRecord {
    constructor(
        public readonly id: string,
        public readonly stream_cursor: EvDbStreamCursor,
        public readonly event_type: string,
        public readonly captured_by: string,
        public readonly captured_at: Date,
        public readonly payload: IEvDbEventPayload,
        public readonly stored_at?: string,
    ) { }

    public static createFromEvent(e: EvDbEvent): EventRecord {
        return new EventRecord(
            crypto.randomUUID(),
            e.streamCursor,
            e.eventType,
            e.capturedBy,
            e.capturedAt,
            e.payload,
            e.storedAt?.getTime().toString())
    }

    public toEvDbEvent(): EvDbEvent {
        return new EvDbEvent(
            this.event_type,
            this.stream_cursor,
            this.payload,
            this.captured_at,
            this.captured_by,
            new Date(Number(this.stored_at))
        )
    }
}

export type MessageRecord = {
    id: string
    stream_cursor: EvDbStreamCursor
    channel: string
    message_type: string
    event_type: string
    captured_by: string
    captured_at: Date
    payload: IEvDbPayloadData
    stored_at?: Date
}

const serializeStreamAddress = (streamAddress: EvDbStreamAddress) => {
    return `${streamAddress.streamType}::${streamAddress.streamId}`;
}

const serializeMessageAddress = (m: MessageRecord) => {
    return `${m.channel}::${m.message_type}`;
}

export default class EvDbDynamoDbStorageAdapterQueries {

    public static saveEvents(events: EventRecord[]): TransactWriteItem[] {
        const TransactItems = events.map(e => ({
            Put: {
                TableName: "events",
                Item: {
                    stream_address: { S: serializeStreamAddress(e.stream_cursor) } as AttributeValue,
                    offset: { N: e.stream_cursor.offset.toString() },
                    event_type: { S: e.event_type },
                    captured_by: { S: e.captured_by },
                    captured_at: { S: e.captured_at.getTime().toString() },
                    payload: { M: e.payload },
                    stored_at: { S: Date.now().toString() }
                },
                ConditionExpression: "(attribute_not_exists(#sa)) Or (attribute_exists(#sa) And attribute_not_exists(#offset))",
                ExpressionAttributeNames: {
                    "#sa": "stream_address",
                    "#offset": "offset"
                }
            }
        }));

        return TransactItems;

    }

    public static saveMessages(messages: MessageRecord[]): TransactWriteItem[] {
        const TransactItems = messages.map(m => ({
            Put: {
                TableName: "events",
                Item: {
                    message_address: { S: serializeMessageAddress(m) },
                    stream_address: { S: serializeStreamAddress(m.stream_cursor) },
                    offset: { N: m.stream_cursor.offset.toString() },
                    event_type: { S: m.event_type },
                    captured_by: { S: m.captured_by },
                    captured_at: { S: m.captured_at.getTime().toString() },
                    payload: { M: m.payload },
                    stored_at: { S: Date.now().toString() }
                },
                ConditionExpression: "(attribute_not_exists(#ma)) Or (attribute_exists(#ma) And attribute_not_exists(#ca))",
                "ExpressionAttributeNames": {
                    "#ma": "message_address",
                    "#ca": "captured_at"
                }
            }
        }));

        return TransactItems;
    }

    public static getLastOffset(streamAddress: EvDbStreamAddress): QueryCommand {
        const queryParams = {
            TableName: "events",
            KeyConditionExpression: "stream_address = :pk",
            ExpressionAttributeValues: {
                ":pk": { S: serializeStreamAddress(streamAddress) }
            },
            ScanIndexForward: false,
            Limit: 1
        }

        return new QueryCommand(queryParams);
    }

    public static getEvents(streamCursor: EvDbStreamCursor, queryCursor: Record<string, any> | undefined = undefined, pageSize: number = 100) {
        const queryParams = {
            TableName: "events",
            KeyConditionExpression: "stream_address = :sa AND #offset >= :offsetValue",
            ExpressionAttributeNames: {
                "#offset": "offset"
            },
            ExpressionAttributeValues: {
                ":sa": { S: serializeStreamAddress(streamCursor) },
                ":offsetValue": { N: streamCursor.offset.toString() }
            },
            ProjectionExpression: 'stream_address, #offset, id, event_type, captured_at, captrued_by, stored_at, payload',
            ScanIndexForward: false,  // false = descending order
            Limit: pageSize,
            ExclusiveStartKey: queryCursor
        }

        return new QueryCommand(queryParams);
    }
}