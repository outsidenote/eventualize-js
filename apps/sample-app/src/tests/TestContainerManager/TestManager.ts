import { EVENT_STORE_TYPE } from "../steps.js";
import type { DynamoDBClientOptions } from "../DynamoDBClientOptions.js";
import type { DynamoDBConfig } from "./dynamodb-setup.js";
import { setupDynamoDBTables } from "./dynamodb-setup.js";
import { createPostgresSchema } from "./postgresql-setup.js";
import { createMysqlSchema } from "./mysql-setup.js";
import { TestContainerManager } from "./TestContainerManager.js";

export class TestManager {
  private readonly containerManager: TestContainerManager | null = null;
  public readonly supportedDatabases: EVENT_STORE_TYPE[];
  private readonly useTestContainers: boolean;

  constructor() {
    this.supportedDatabases = this.getTestedDatabases();
    this.useTestContainers = process.env.TEST_CONTAINER == "true";
    if (this.useTestContainers) {
      this.containerManager = new TestContainerManager();
    }
  }

  public async start(): Promise<void> {
    // Step 1: Start containers if needed (provides dynamic connection info)
    if (this.containerManager) {
      await this.containerManager.startDatabases(this.supportedDatabases);
    }

    // Step 2: Create schemas/tables (same path for both container and bare modes)
    const setupPromises: Promise<void>[] = [];

    if (this.supportedDatabases.includes(EVENT_STORE_TYPE.POSTGRES)) {
      const connectionUri = this.getConnection(EVENT_STORE_TYPE.POSTGRES) as string | undefined;
      if (connectionUri) {
        setupPromises.push(createPostgresSchema(connectionUri));
      }
    }

    if (this.supportedDatabases.includes(EVENT_STORE_TYPE.MYSQL)) {
      const connectionUri = this.getConnection(EVENT_STORE_TYPE.MYSQL) as string | undefined;
      if (connectionUri) {
        setupPromises.push(createMysqlSchema(connectionUri));
      }
    }

    if (this.supportedDatabases.includes(EVENT_STORE_TYPE.DYNAMODB)) {
      const config = this.getConnection(EVENT_STORE_TYPE.DYNAMODB) as DynamoDBConfig | undefined;
      if (config) {
        setupPromises.push(setupDynamoDBTables(config));
      }
    }

    await Promise.all(setupPromises);
  }

  public async stop(): Promise<void> {
    await this.containerManager?.stopAll();
  }

  public getConnection(storeType: EVENT_STORE_TYPE): string | DynamoDBConfig | undefined {
    const connection = this.containerManager?.getConnection(storeType);
    if (connection) return connection;

    if (storeType === EVENT_STORE_TYPE.DYNAMODB) {
      return {
        endpoint: process.env.DYNAMODB_CONNECTION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION,
      } as DynamoDBConfig;
    }
    return process.env[`${storeType.toUpperCase()}_CONNECTION`];
  }

  public getDynamoDbOptions(): DynamoDBClientOptions | undefined {
    const dynamoDbConfig = this.containerManager?.getDynamoDbOptions();
    if (dynamoDbConfig) return dynamoDbConfig;

    return {
      endpoint: process.env.DYNAMODB_CONNECTION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
    };
  }

  private getTestedDatabases = (): EVENT_STORE_TYPE[] => {
    if (!process.env.TEST_DATABASES) {
      return [EVENT_STORE_TYPE.MYSQL, EVENT_STORE_TYPE.POSTGRES, EVENT_STORE_TYPE.DYNAMODB];
    }

    const testDatabases = process.env.TEST_DATABASES;
    const databases = testDatabases.split(",").map((db) => db.trim());
    return databases.filter((db): db is EVENT_STORE_TYPE =>
      Object.values(EVENT_STORE_TYPE).includes(db as EVENT_STORE_TYPE),
    );
  };
}
