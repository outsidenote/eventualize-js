import IEvDbStorageAdmin from "@eventualize/types/IEvDbStorageAdmin";


export default class EvDbPrismaStorageAdmin implements IEvDbStorageAdmin {
    constructor(private prisma: any) { }
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
        throw new Error('Method not implemented.');
    }
    async close(): Promise<void> {
        await this.prisma.$disconnect();
    }
    disposeAsync(): Promise<void> {
        throw new Error("Method not implemented.");
    }

}