import { TestContainerManager } from './TestContainerManager/index.js';
import { EVENT_STORE_TYPE } from './steps.js';

const getTestedDatabases = (): EVENT_STORE_TYPE[] => {
    if (!process.env.TEST_DATABASES) {
        return [EVENT_STORE_TYPE.MYSQL, EVENT_STORE_TYPE.POSTGRES, EVENT_STORE_TYPE.DYNAMODB];
    }

    const testDatabases = process.env.TEST_DATABASES;
    const databases = testDatabases.split(',').map(db => db.trim());
    return databases
        .filter((db): db is EVENT_STORE_TYPE =>
            Object.values(EVENT_STORE_TYPE)
                .includes(db as EVENT_STORE_TYPE)
        );
};

// Container manager instance - shared across all tests

export async function startSupportedDatabases(): Promise<TestContainerManager> {
    const containerManager = new TestContainerManager();
    console.log('\n=== Starting test containers ===\n');
    const supportedDatabases = getTestedDatabases();
    await containerManager.startDatabases(supportedDatabases);
    console.log('\n=== All containers started ===\n');
    return containerManager;
}