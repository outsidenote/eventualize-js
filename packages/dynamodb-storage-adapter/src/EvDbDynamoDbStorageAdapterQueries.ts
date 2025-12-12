import IEvDbEventPayload, { IEvDbPayloadData } from "@eventualize/types/IEvDbEventPayload"
import { AttributeValue, TransactWriteItem } from "@aws-sdk/client-dynamodb";
import EvDbStreamCursor from "@eventualize/types/EvDbStreamCursor";

export type EventRecord = {
    id: string
    stream_cursor: EvDbStreamCursor
    event_type: string
    captured_by: string
    captured_at: Date
    payload: IEvDbEventPayload
    stored_at?: string
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

const serializeStreamAddress = (streamAddress: EvDbStreamCursor) => {
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
}