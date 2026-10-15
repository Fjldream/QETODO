import type { ConflictResponse, MutationAck, TaskDto } from '@qetodo/contracts';
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api/http.js';
import { createLocalDb, type LocalDatabase } from '../db/localDb.js';
import { LocalTaskStore } from '../db/taskStore.js';
import { taskFixture } from '../features/tasks/taskFixture.js';
import { resolveConflict } from './conflictResolver.js';
import { OutboxRepository, type OutboxOperation } from './outbox.js';
import { SyncEngine } from './syncEngine.js';

let db: LocalDatabase | undefined;
const baseTask = taskFixture('原始任务');

afterEach(async () => {
  vi.useRealTimers();
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
    baseVersion: 1,
    data: { title: '本地标题' },
    createdAt: new Date().toISOString(),
    retryCount: 0,
    lastError: null,
    ...overrides,
  };
}

async function setup(queued = operation()) {
  db = createLocalDb(`qetodo-sync-${crypto.randomUUID()}`);
  const outbox = new OutboxRepository(db);
  const tasks = new LocalTaskStore(db);
  await outbox.enqueue(queued);
  return { queued, outbox, tasks };
}

describe('SyncEngine', () => {
  it('remaps offline-created task IDs and preserves subsequent edits until they are acknowledged', async () => {
    const local = { ...baseTask, id: crypto.randomUUID(), title: '离线修改后', version: 2 };
    const create = operation({ taskId: local.id, kind: 'create', baseVersion: null });
    const { outbox, tasks } = await setup(create);
    await tasks.put(local);
    await outbox.enqueue(operation({ taskId: local.id, data: { title: '离线修改后' } }));
    const serverId = crypto.randomUUID();
    let sawEdit = false;
    const engine = new SyncEngine({ outbox, tasks, send: async queued => {
      if (queued.kind === 'create') return { operationId: queued.operationId, data: { ...baseTask, id: serverId, title: '创建时标题', version: 3 } };
      expect(queued.taskId).toBe(serverId);
      expect(queued.baseVersion).toBe(3);
      expect((await tasks.get(serverId))?.title).toBe('离线修改后');
      sawEdit = true;
      return { operationId: queued.operationId, data: { ...baseTask, id: serverId, title: '离线修改后', version: 4 } };
    } });
    await engine.flush();
    expect(sawEdit).toBe(true);
    expect(await outbox.count()).toBe(0);
    expect((await tasks.get(serverId))?.title).toBe('离线修改后');
    expect(await tasks.get(local.id)).toMatchObject({ id: serverId });
  });
  it('keeps failed operations and acknowledges a successful retry exactly once', async () => {
    const { queued, outbox, tasks } = await setup();
    const serverTask = { ...baseTask, title: '本地标题', version: 2 } satisfies TaskDto;
    const send = vi.fn<() => Promise<MutationAck<TaskDto>>>()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue({ operationId: queued.operationId, data: serverTask });
    const engine = new SyncEngine({ outbox, tasks, send });

    await engine.flush();
    expect(await outbox.peek()).toEqual([expect.objectContaining({ retryCount: 1 })]);
    await engine.flush();
    await engine.flush();

    expect(await outbox.peek()).toHaveLength(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect((await tasks.get(baseTask.id))?.version).toBe(2);
  });

  it('pauses on 401 without dropping the row and resumes after reauthentication', async () => {
    const { queued, outbox, tasks } = await setup();
    const send = vi.fn()
      .mockRejectedValueOnce(new ApiError('登录失效', 401, 'AUTHENTICATION_REQUIRED'))
      .mockResolvedValue({ operationId: queued.operationId, data: { ...baseTask, version: 2 } });
    const engine = new SyncEngine({ outbox, tasks, send });

    await engine.flush();
    expect(engine.getStatus()).toBe('authentication-required');
    expect(await outbox.peek()).toHaveLength(1);
    await engine.resumeAfterAuthentication();

    expect(engine.getStatus()).toBe('idle');
    expect(await outbox.peek()).toHaveLength(0);
  });

  it('surfaces both versions on 409 and queues a version-checked user choice', async () => {
    const { queued, outbox, tasks } = await setup();
    const conflict: ConflictResponse = {
      code: 'VERSION_CONFLICT',
      operationId: queued.operationId,
      local: { ...baseTask, title: '本地标题' },
      server: { ...baseTask, title: '服务器标题', version: 3 },
    };
    const onConflict = vi.fn();
    const engine = new SyncEngine({
      outbox,
      tasks,
      send: vi.fn().mockRejectedValue(new ApiError('冲突', 409, 'VERSION_CONFLICT', conflict)),
      onConflict,
    });

    await engine.flush();

    expect(onConflict).toHaveBeenCalledWith(conflict);
    expect(await outbox.peek()).toHaveLength(1);
    const resolution = resolveConflict(conflict, 'local', crypto.randomUUID());
    expect(resolution.baseVersion).toBe(3);
    expect(resolution.data).toEqual(expect.objectContaining({ title: '本地标题' }));
  });
});
