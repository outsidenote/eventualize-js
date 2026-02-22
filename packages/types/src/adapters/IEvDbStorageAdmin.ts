/**
 * Interface for EvDb storage administration
 * Handles environment setup and teardown operations
 */
export default interface IEvDbStorageAdmin {
  /**
   * Create the database environment (tables, indexes, etc.)
   */
  createEnvironmentAsync(): Promise<void>;

  /**
   * Destroy the database environment (drop tables, schema, etc.)
   */
  destroyEnvironmentAsync(): Promise<void>;

  /**
   * Clear environment data (delete from tables, etc.)
   */
  clearEnvironmentAsync(): Promise<void>;

  /**
   * Dispose of resources synchronously (if applicable)
   */
  dispose?(): void;

  /**
   * Dispose of resources asynchronously
   */
  disposeAsync(): Promise<void>;

  /**
   * Close the connection to the store
   */
  close(): Promise<void>;
}
