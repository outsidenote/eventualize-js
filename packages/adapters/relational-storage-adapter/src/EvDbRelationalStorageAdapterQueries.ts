import type { PrismaClient, Prisma } from "./generated/prisma/client.js";

// ============================================================================
// Prisma-based Query Methods (Type-safe alternatives to raw SQL)
// ============================================================================

export class PrismaQueryProvider {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get the last offset for a stream using Prisma
   */
  async getLastOffset(stream_type: string, stream_id: string) {
    return this.prisma.events.findFirst({
      where: { stream_type, stream_id },
      select: { offset: true },
      orderBy: { offset: "desc" },
    });
  }

  /**
   * Get events for a stream since an offset using Prisma
   * @param stream_type - The stream type.
   * @param stream_id - The stream id.
   * @param since_offset - The first offset to return (inclusive).
   * @param pageSize - The maximum number of rows to return. Default 100.
   * @returns Up to `pageSize` events, in ascending offset order.
   */
  async getEvents(
    stream_type: string,
    stream_id: string,
    since_offset: number,
    pageSize: number = 100,
  ) {
    return this.prisma.events.findMany({
      where: {
        stream_type,
        stream_id,
        offset: { gte: since_offset },
      },
      select: {
        id: true,
        stream_type: true,
        stream_id: true,
        offset: true,
        event_type: true,
        captured_at: true,
        captured_by: true,
        payload: true,
        stored_at: true,
        traceparent: true,
        tracestate: true,
      },
      orderBy: { offset: "asc" },
      take: pageSize,
    });
  }

  /**
   * Get messages with filtering using Prisma
   */
  async getMessages(
    table_name: string,
    since_date: Date,
    channels?: string[],
    message_types?: string[],
  ) {
    const now = new Date();
    const oneSecondAgo = new Date(now.getTime() - 1000);

    // Note: This assumes a dynamic table name approach
    // In Prisma, you'd typically use $queryRawUnsafe for dynamic table names
    const whereClause: Record<string, unknown> = {
      stored_at: { gte: since_date, lt: oneSecondAgo },
    };

    if (channels && channels.length > 0) {
      whereClause.channel = { in: channels };
    }

    if (message_types && message_types.length > 0) {
      whereClause.messageType = { in: message_types };
    }

    // This would need to be adapted based on your actual Prisma schema
    return this.prisma.$queryRawUnsafe(
      `SELECT * FROM ${table_name} WHERE stored_at >= $1 AND stored_at < $2`,
      since_date,
      oneSecondAgo,
    );
  }

  /**
   * Save events in batch using Prisma
   */
  saveEvents(events: Array<Prisma.eventsCreateInput>) {
    return this.prisma.events.createMany({ data: events });
  }

  /**
   * Save messages in batch using Prisma
   */
  saveMessages(messages: Array<Prisma.outboxCreateInput>) {
    return this.prisma.outbox.createMany({ data: messages });
  }

  /**
   * Get snapshot using Prisma
   * @param streamType - The stream type.
   * @param streamId - The stream id.
   * @param viewName - The view name.
   * @param maxOffset - Optional upper bound: only snapshots with offset `<= maxOffset` match.
   * @returns The latest matching snapshot, or `null` when none matches.
   */
  async getSnapshot(streamType: string, streamId: string, viewName: string, maxOffset?: number) {
    return this.prisma.snapshot.findFirst({
      where: {
        stream_type: streamType,
        stream_id: streamId,
        view_name: viewName,
        ...(maxOffset === undefined ? {} : { offset: { lte: maxOffset } }),
      },
      select: {
        state: true,
        stored_at: true,
        offset: true,
      },
      orderBy: {
        offset: "desc",
      },
    });
  }

  /**
   * Save snapshot using Prisma
   */
  async saveSnapshot(data: Prisma.snapshotCreateInput) {
    return this.prisma.snapshot.create({
      data,
    });
  }
}
