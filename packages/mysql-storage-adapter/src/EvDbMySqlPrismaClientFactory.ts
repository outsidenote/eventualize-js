import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client.js';

export default class EvDbPostgresPrismaClientFactory {
    public static create() {
        const connectionString = `${process.env.MYSQL_URL}`;
        const adapter = new PrismaMariaDb(connectionString);
        return new PrismaClient({ adapter });
    }
}