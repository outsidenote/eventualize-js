import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client.js';

export default class EvDbMySqlPrismaClientFactory {
    /**
     * Creates a Prisma client configured for MySQL.
     * @param connectionString - Optional connection string. Falls back to MYSQL_URL env var if not provided.
     */
    public static create(connectionString?: string) {
        const connStr = connectionString ?? process.env.MYSQL_URL;
        if (!connStr) {
            throw new Error('MySQL connection string not provided and MYSQL_URL env var is not set');
        }
        const adapter = new PrismaMariaDb(connStr);
        return new PrismaClient({ adapter });
    }
}