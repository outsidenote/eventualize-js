import type IEvDbStorageAdmin from "@eventualize/types/adapters/IEvDbStorageAdmin";

/** Minimal structural type describing the PrismaClient operations used by the admin. */
interface PrismaAdminClient {
  events: { deleteMany(args: object): Promise<unknown> };
  snapshot: { deleteMany(args: object): Promise<unknown> };
  outbox: { deleteMany(args: object): Promise<unknown> };
  $disconnect(): Promise<void>;
}

export default class EvDbPrismaStorageAdmin implements IEvDbStorageAdmin {
  constructor(private prisma: PrismaAdminClient) {}

  async clearEnvironmentAsync(): Promise<void> {
    await Promise.all([
      this.prisma.events.deleteMany({}),
      this.prisma.snapshot.deleteMany({}),
      this.prisma.outbox.deleteMany({}),
    ]);
  }

  createEnvironmentAsync(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  destroyEnvironmentAsync(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
  disposeAsync(): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
