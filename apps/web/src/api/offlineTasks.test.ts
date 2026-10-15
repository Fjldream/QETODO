import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLocalDb, type LocalDatabase } from '../db/localDb.js';
import { taskFixture } from '../features/tasks/taskFixture.js';
import type { HttpClient, RequestOptions } from './http.js';
import { createOfflineTasksApi } from './offlineTasks.js';

let db: LocalDatabase | undefined;
afterEach(async () => { if (db) { await db.delete(); db = undefined; } });

describe('offline task operations', () => {
  it('acknowledges a tagged create as one operation and allows subsequent edits to the same task', async () => {
    db = createLocalDb(`tagged-create-${crypto.randomUUID()}`);
    const id = crypto.randomUUID();
    let serverTask = taskFixture('带标签任务', { id });
    const client: HttpClient = {
      async request<T>(path: string, options?: RequestOptions): Promise<T> {
        const body = options?.body as { operationId: string; data: { title?: string; names?: string[] } };
        if (path === '/api/tasks') serverTask = { ...serverTask, title: body.data.title!, version: 1 };
        else if (path.endsWith('/tags')) serverTask = { ...serverTask, tags: [{ id: crypto.randomUUID(), name: '质量异常', color: null }], version: 2 };
        else serverTask = { ...serverTask, title: body.data.title!, version: 3 };
        return { operationId: body.operationId, data: serverTask } as T;
      },
      setCsrfToken: () => undefined,
      clearCsrfToken: () => undefined,
    };
    const api = createOfflineTasksApi(client, db);
    const optimistic = await api.create({ title: '带标签任务', tags: ['质量异常'], imageFiles: [] });
    await vi.waitFor(async () => expect(await db!.outbox.count()).toBe(0));
    const acknowledged = await api.get(optimistic.id);
    expect(acknowledged).toMatchObject({ id, version: 2 });
    await api.update(optimistic.id, 2, { title: '编辑已同步' });
    await vi.waitFor(async () => expect(await db!.outbox.count()).toBe(0));
    expect(await db.tasks.toArray()).toEqual([expect.objectContaining({ id, title: '编辑已同步', version: 3 })]);
  });
});
