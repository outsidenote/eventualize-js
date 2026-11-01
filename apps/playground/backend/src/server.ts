import EvDbPostgresPrismaClientFactory from "@eventualize/postgres-storage-adapter/EvDbPostgresPrismaClientFactory";
import { EvDbPrismaStorageAdapter } from "@eventualize/relational-storage-adapter/EvDbPrismaStorageAdapter";
import { createListAccounts } from "./accounts/listAccounts.js";
import { createApp } from "./http/createApp.js";

const prisma = EvDbPostgresPrismaClientFactory.create(); // reads POSTGRES_CONNECTION
const storage = new EvDbPrismaStorageAdapter(prisma, { kind: "postgres" });
const app = createApp({ storage, listAccounts: createListAccounts(prisma) });

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => {
  console.log(`playground-backend listening on :${port}`);
});

function shutdown(): void {
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
