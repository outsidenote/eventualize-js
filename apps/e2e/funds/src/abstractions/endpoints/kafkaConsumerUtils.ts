import { type Kafka, type Consumer } from "kafkajs";

const RETRY_INTERVAL_MS = 5_000;

export type EventMeta = { outboxId: string; storedAt: Date };

export function launchKafkaConsumer(opts: {
  kafka: Kafka;
  groupId: string;
  topics: string[];
  fromBeginning?: boolean;
  onMessage: (topic: string, payload: Record<string, unknown>, meta: EventMeta) => Promise<void>;
}): { stop: () => Promise<void> } {
  const { kafka, groupId, topics, fromBeginning = true, onMessage } = opts;

  let stopped = false;
  let consumer: Consumer | null = null;
  const retryTimers: ReturnType<typeof setTimeout>[] = [];

  const scheduleRetry = () => {
    if (stopped) return;
    const timer = setTimeout(() => { if (!stopped) void attempt(); }, RETRY_INTERVAL_MS);
    retryTimers.push(timer);
  };

  const attempt = async () => {
    if (stopped) return;
    const c = kafka.consumer({ groupId });
    consumer = c;
    try {
      await c.connect();
      await c.subscribe({ topics, fromBeginning });
      console.info("[KafkaConsumer] started", { groupId, topics });
      await c.run({
        autoCommit: false,
        eachMessage: async ({ topic, partition, message, heartbeat }) => {
          void heartbeat();
          const outboxId = extractOutboxId(message);
          const payload = parsePayload(message);

          await onMessage(topic, payload, { outboxId, storedAt: new Date(Number(message.timestamp)) });
          await c.commitOffsets([{ topic, partition, offset: (BigInt(message.offset) + 1n).toString() }]);
        },
      });
    } catch (err) {
      const isMissing = err instanceof Error && (err as Error & { type?: string }).type === "UNKNOWN_TOPIC_OR_PARTITION";
      if (isMissing) {
        console.info(`[KafkaConsumer] ${groupId} topic not yet available, retrying in ${RETRY_INTERVAL_MS / 1000}s`);
      } else {
        console.error(`[KafkaConsumer] ${groupId} crashed, retrying in ${RETRY_INTERVAL_MS / 1000}s`, err);
      }
      try { await c.disconnect(); } catch { /* best-effort */ }
      consumer = null;
      scheduleRetry();
    }
  };

  void attempt();

  return {
    stop: async () => {
      stopped = true;
      for (const timer of retryTimers) clearTimeout(timer);
      retryTimers.length = 0;
      if (consumer) {
        try { await consumer.disconnect(); } catch (err) { console.warn("[KafkaConsumer] disconnect failed", err); } finally { consumer = null; }
      }
    },
  };
}

export function extractOutboxId(message: { key: Buffer | null; value: Buffer | null; headers?: Record<string, unknown> }): string {
  if (message.headers) {
    const idHeader = message.headers["id"];
    if (idHeader) return Buffer.isBuffer(idHeader) ? idHeader.toString() : String(idHeader);
  }
  if (message.value) {
    try {
      const parsed = JSON.parse(message.value.toString());
      const value = parsed.payload ?? parsed;
      if (value && typeof value === "object" && "outboxId" in value) return String((value as Record<string, unknown>).outboxId);
    } catch { /* best-effort */ }
  }
  throw new Error("[KafkaConsumer] Cannot extract outboxId — header 'id' missing and payload has no outboxId.");
}

export function parsePayload(message: { value: Buffer | null }): Record<string, unknown> {
  if (!message.value) throw new Error("[KafkaConsumer] message value is null");
  try {
    const parsed = JSON.parse(message.value.toString());
    const inner = parsed.payload ?? parsed;
    if (typeof inner === "string") {
      const obj = JSON.parse(inner);
      if (!isRecord(obj)) throw new Error("payload is not an object");
      return obj;
    }
    if (!isRecord(inner)) throw new Error("payload is not an object");
    return inner;
  } catch (err) {
    throw new Error(`[KafkaConsumer] payload parse failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
