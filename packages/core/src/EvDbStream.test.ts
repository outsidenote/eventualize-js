import { test, describe } from 'node:test';
import * as assert from 'node:assert';

describe('EvDbStream', () => {
  test('module can be imported', async () => {
    const module = await import('./EvDbStream.js');
    assert.ok(module.default, 'EvDbStream should be exported as default');
  });
});

describe('EvDbView', () => {
  test('module can be imported', async () => {
    const module = await import('./EvDbView.js');
    assert.ok(module.EvDbView, 'EvDbView should be exported');
  });
});

describe('EvDbEventStore', () => {
  test('module can be imported', async () => {
    const module = await import('./EvDbEventStore.js');
    assert.ok(module.EvDbEventStoreBuilder, 'EvDbEventStoreBuilder should be exported');
  });
});
