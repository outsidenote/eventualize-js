import { PrismaClient, Prisma } from './generated/prisma/client.js';
import IEvDbStorageAdmin from "@eventualize/types/IEvDbStorageAdmin";


export default class EvDbPrismaStorageAdmin implements IEvDbStorageAdmin {
    constructor(private prisma: PrismaClient) { }
    async clearEnvironmentAsync(): Promise<void> {
        await this.prisma.$executeRawUnsafe(`
delete from events;
delete from "snapshot" ;
delete from "outbox";
`)
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