import { PrismaPg } from '@prisma/adapter-pg';


import { PrismaClient } from './generated/prisma/client.js';

export default class EvDbPostgresPrismaClientFactory {
    /**
     * Creates a Prisma client configured for PostgreSQL.
     * @param connectionString - Optional connection string. Falls back to POSTGRES_URL env var if not provided.
     */
    public static create(connectionString?: string) {
        const connStr = connectionString ?? process.env.POSTGRES_URL;
        if (!connStr) {
            throw new Error('PostgreSQL connection string not provided and POSTGRES_URL env var is not set');
        }
        const adapter = new PrismaPg({ connectionString: connStr })
        return new PrismaClient({ adapter })
    }
}