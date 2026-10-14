import type { PrismaClient } from "@eventualize/relational-storage-adapter/EvDbPrismaClient";
import { STREAM_TYPE } from "../domain/streamType.js";

/**
 * The library has no "list streams" API, so this reads the events table directly.
 * Keep all direct table access in this module.
 */
export function createListAccounts(prisma: PrismaClient): () => Promise<string[]> {
  return async () => {
    const rows = await prisma.events.findMany({
      where: { stream_type: STREAM_TYPE },
      distinct: ["stream_id"],
      select: { stream_id: true },
      orderBy: { stream_id: "asc" },
    });
    return rows.map((r) => r.stream_id);
  };
}
