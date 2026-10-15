import type { TaskDto } from '@qetodo/contracts';
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';

import { createLocalDb, type LocalDatabase } from '../db/localDb.js';
import { LocalTaskStore } from '../db/taskStore.js';
import { taskFixture } from '../features/tasks/taskFixture.js';
import { OutboxRepository, type OutboxOperation } from './outbox.js';

let db: LocalDatabase | undefined;
const baseTask = taskFixture('原始任务');

afterEach(async () => {
  if (!db) return;
  const name = db.name;
  db.close();
  await indexedDB.deleteDatabase(name);
  db = undefined;
});

function operation(overrides: Partial<OutboxOperation> = {}): OutboxOperation {
  return {
    operationId: crypto.randomUUID(),
    taskId: baseTask.id,
    kind: 'update',
    baseVersion: baseTask.version,
    data: { title: '现场整改' },
    createdAt: new Date().toISOString(),
    retryCount: 0,
    lastError: null,
    ...overrides,
  };
}

describe('offline task store and outbox', () => {
  it('makes an optimistic mutation visible before any network response and restores it after reload', async () => {
    const name = `qetodo-test-${crypto.randomUUID()}`;
    db = createLocalDb(name);
    const store = new LocalTaskStore(db);
    const outbox = new OutboxRepository(db);
    const optimistic = { ...baseTask, title: '现场整改', version: 2 } satisfies TaskDto;
    const queued = operation();

    await store.applyOptimistic(optimistic, queued);

    expect((await store.get(baseTask.id))?.title).toBe('现场整改');
    expect(await outbox.peek()).toEqual([expect.objectContaining({ operationId: queued.operationId })]);

    db.close();
    db = createLocalDb(name);
    expect((await new LocalTaskStore(db).get(baseTask.id))?.title).toBe('现场整改');
    expect(await new OutboxRepository(db).peek()).toHaveLength(1);
  });

  it('preserves FIFO order and stores identical operation IDs only once', async () => {
    db = createLocalDb(`qetodo-test-${crypto.randomUUID()}`);
    const outbox = new OutboxRepository(db);
    const first = operation({ operationId: crypto.randomUUID(), createdAt: '2026-10-15T08:00:00.000Z' });
    const second = operation({ operationId: crypto.randomUUID(), createdAt: '2026-10-15T08:01:00.000Z' });

    await outbox.enqueue(second);
    await outbox.enqueue(first);
    await outbox.enqueue(first);

    expect((await outbox.peek()).map(({ operationId }) => operationId)).toEqual([second.operationId, first.operationId]);
  });

  it('keeps a deletion tombstone queued until the server acknowledges it', async () => {
    db = createLocalDb(`qetodo-test-${crypto.randomUUID()}`);
    const store = new LocalTaskStore(db);
    const outbox = new OutboxRepository(db);
    await store.put(baseTask);
    const deletion = operation({ kind: 'delete', data: {}, operationId: crypto.randomUUID() });

    await store.deleteOptimistically(baseTask.id, deletion, '2026-10-15T09:00:00.000Z');

    expect((await store.get(baseTask.id))?.deletedAt).toBe('2026-10-15T09:00:00.000Z');
    expect(await outbox.peek()).toHaveLength(1);
    await outbox.ack(deletion.operationId);
    expect(await outbox.peek()).toHaveLength(0);
  });
});
