import type { StartedLocalStackContainer } from "@testcontainers/localstack";
import { LocalstackContainer } from "@testcontainers/localstack";
import type { StartedMySqlContainer } from "@testcontainers/mysql";
import { MySqlContainer } from "@testcontainers/mysql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StoppedTestContainer } from "testcontainers";
import { EVENT_STORE_TYPE } from "../EVENT_STORE_TYPE.js";
import type { DynamoDBConfig } from "./dynamodb-setup.js";

/**
 * Manages test container lifecycle for integration tests.
 * Only responsible for spinning up/stopping containers and providing connection info.
 */

export class TestContainerManager {
  private postgresContainer?: StartedPostgreSqlContainer;
  private mysqlContainer?: StartedMySqlContainer;
  private localstackContainer?: StartedLocalStackContainer;
  private connections: Partial<Record<EVENT_STORE_TYPE, string | DynamoDBConfig>> = {};

  public getConnection(type: EVENT_STORE_TYPE): string | DynamoDBConfig | undefined {
    return this.connections[type];
  }

  public async startDatabases(databases: EVENT_STORE_TYPE[]): Promise<void> {
    console.log("\n=== Starting test containers ===\n");

    const startPromises: Promise<void>[] = [];
    if (databases.includes(EVENT_STORE_TYPE.POSTGRES)) {
      startPromises.push(
        this.startPostgres().then((uri) => {
          this.connections[EVENT_STORE_TYPE.POSTGRES] = uri;
        }),
      );
    }

    if (databases.includes(EVENT_STORE_TYPE.MYSQL)) {
      startPromises.push(
        this.startMySql().then((uri) => {
          this.connections[EVENT_STORE_TYPE.MYSQL] = uri;
        }),
      );
    }

    if (databases.includes(EVENT_STORE_TYPE.DYNAMODB)) {
      startPromises.push(
        this.startDynamoDB().then((config) => {
          this.connections[EVENT_STORE_TYPE.DYNAMODB] = config;
        }),
      );
    }
    await Promise.all(startPromises);
    console.log("\n=== All containers started ===\n");
  }

  private async startPostgres(): Promise<string> {
    console.log("Starting PostgreSQL container...");
    this.postgresContainer = await new PostgreSqlContainer("postgres:18.1")
      .withDatabase("evdb_test")
      .withUsername("evdb")
      .withPassword("evdbpassword")
      .start();

    const connectionUri = this.postgresContainer.getConnectionUri();
    console.log(`PostgreSQL container started at: ${connectionUri}`);
    return connectionUri;
  }

  private async startMySql(): Promise<string> {
    console.log("Starting MySQL container...");
    this.mysqlContainer = await new MySqlContainer("mysql:9.0")
      .withDatabase("evdb_test")
      .withUsername("evdb")
      .withRootPassword("rootpassword")
      .withUserPassword("evdbpassword")
      .start();

    // Get connection details and construct mariadb:// URI for Prisma MariaDB adapter
    const host = this.mysqlContainer.getHost();
    const port = this.mysqlContainer.getPort();
    const connectionUri = `mariadb://evdb:evdbpassword@${host}:${port}/evdb_test`;
    console.log(`MySQL container started at: ${connectionUri}`);
    return connectionUri;
  }

  private async startDynamoDB(): Promise<DynamoDBConfig> {
    console.log("Starting LocalStack (DynamoDB) container...");
    this.localstackContainer = await new LocalstackContainer("localstack/localstack:3.8").start();

    const endpoint = this.localstackContainer.getConnectionUri();
    const config: DynamoDBConfig = {
      endpoint,
      accessKeyId: "test",
      secretAccessKey: "test",
      region: "us-east-1",
    };
    console.log(`LocalStack (DynamoDB) container started at: ${endpoint}`);
    return config;
  }

  async stopAll(): Promise<StoppedTestContainer[]> {
    console.log("\n=== Stopping test containers ===\n");

    const stopPromises: Promise<StoppedTestContainer>[] = [];

    if (this.postgresContainer) {
      console.log("Stopping PostgreSQL container...");
      stopPromises.push(this.postgresContainer.stop());
    }

    if (this.mysqlContainer) {
      console.log("Stopping MySQL container...");
      stopPromises.push(this.mysqlContainer.stop());
    }

    if (this.localstackContainer) {
      console.log("Stopping LocalStack container...");
      stopPromises.push(this.localstackContainer.stop());
    }

    const response = await Promise.all(stopPromises);
    console.log("All containers stopped.");
    return response;
  }

  public getDynamoDbOptions(): DynamoDBConfig | undefined {
    return this.connections[EVENT_STORE_TYPE.DYNAMODB] as DynamoDBConfig | undefined;
  }
}
