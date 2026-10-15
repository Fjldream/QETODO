import { randomUUID } from 'node:crypto';

import { mutationAckSchema, taskDtoSchema } from '@qetodo/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import type { AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { createTestDatabase } from '../../db/testDatabase.js';
import {
  OpenSubtasksConfirmationRequiredError,
  TaskService,
} from './task.service.js';
import { ScryptPasswordHasher } from '../auth/password.js';

const userId = '7d831d11-27b9-42f3-bce7-005d4ed3c005';

describe('task detail operations', () => {
  let database: AppDatabase;
  let service: TaskService;

  beforeEach(() => {
    database = createTestDatabase();
    migrateDatabase(database);
    database.sqlite
      .prepare(
        `INSERT INTO users (id, username, password_hash, created_at, updated_at)
         VALUES (?, 'admin', 'hash', 1, 1)`,
      )
      .run(userId);
    service = new TaskService(
      database,
      { now: () => new Date('2026-10-15T02:00:00.000Z') },
      userId,
    );
  });

  afterEach(() => database.close());

  it('stores case-insensitively unique tags and increments the task once', () => {
    const task = service.create({ title: '标签测试' }, randomUUID());

    const updated = service.setTags(
      task.id,
      1,
      ['供应商', 'supplier', 'SUPPLIER', '供应商'],
      randomUUID(),
    );

    expect(updated.version).toBe(2);
    expect(updated.tags.map(({ name }) => name)).toEqual(['supplier', '供应商']);
  });

  it('retains explicit subtask order and increments once per change', () => {
    const task = service.create({ title: '子任务测试' }, randomUUID());
    const first = service.createSubtask(task.id, 1, { title: '第二步', sortOrder: 1 }, randomUUID());
    const second = service.createSubtask(task.id, 2, { title: '第一步', sortOrder: 0 }, randomUUID());
    const firstId = second.subtasks.find(({ title }) => title === '第二步')!.id;
    const changed = service.updateSubtask(
      task.id,
      firstId,
      3,
      { completed: true, sortOrder: 2 },
      randomUUID(),
    );

    expect(first.version).toBe(2);
    expect(second.subtasks.map(({ title }) => title)).toEqual(['第一步', '第二步']);
    expect(changed.version).toBe(4);
    expect(changed.subtasks.find(({ id }) => id === firstId)).toMatchObject({
      completed: true,
      sortOrder: 2,
    });
  });

  it('requires confirmation before completing a task with open subtasks', () => {
    const task = service.create({ title: '完成前确认' }, randomUUID());
    const withSubtask = service.createSubtask(
      task.id,
      1,
      { title: '尚未完成', sortOrder: 0 },
      randomUUID(),
    );

    expect(() =>
      service.transition(withSubtask.id, 2, { type: 'complete' }, randomUUID()),
    ).toThrow(OpenSubtasksConfirmationRequiredError);

    const completed = service.transition(
      withSubtask.id,
      2,
      { type: 'complete', confirmOpenSubtasks: true },
      randomUUID(),
    );
    expect(completed.status).toBe('completed');
  });

  it('appends manual progress without making system activities editable', () => {
    const task = service.create({ title: '动态测试' }, randomUUID());
    const updated = service.addManualActivity(task.id, 1, '已电话催办', randomUUID());

    expect(updated.version).toBe(2);
    expect(updated.activities.map(({ kind, system }) => ({ kind, system }))).toEqual([
      { kind: 'manual', system: false },
      { kind: 'created', system: true },
    ]);
    expect('updateActivity' in service).toBe(false);
  });
});

describe('task detail routes', () => {
  let app: FastifyInstance;
  let database: AppDatabase;
  let session: { cookie: string; csrfToken: string };

  beforeEach(async () => {
    database = createTestDatabase();
    migrateDatabase(database);
    const passwordHash = await new ScryptPasswordHasher().hash('quality-pass');
    database.sqlite
      .prepare(
        `INSERT INTO users (id, username, password_hash, created_at, updated_at)
         VALUES (?, 'admin', ?, 1, 1)`,
      )
      .run(userId, passwordHash);
    app = buildApp({
      database,
      appOrigin: 'https://todo.example.com',
      clock: { now: () => new Date('2026-10-15T02:00:00.000Z') },
    });
    session = await routeLogin(app);
  });

  afterEach(async () => {
    await app.close();
    database.close();
  });

  it('exposes versioned detail, search, trash, and restore operations', async () => {
    const created = taskAck(
      await routeMutation(app, session, 'POST', '/api/tasks', null, { title: '路线检索' }),
    );
    const tagged = taskAck(
      await routeMutation(app, session, 'PUT', `/api/tasks/${created.id}/tags`, 1, {
        names: ['航空'],
      }),
    );
    const withSubtask = taskAck(
      await routeMutation(app, session, 'POST', `/api/tasks/${created.id}/subtasks`, 2, {
        title: '检查报告',
        sortOrder: 0,
      }),
    );
    const subtaskId = withSubtask.subtasks[0]!.id;
    const updatedSubtask = taskAck(
      await routeMutation(
        app,
        session,
        'PATCH',
        `/api/tasks/${created.id}/subtasks/${subtaskId}`,
        3,
        { completed: true },
      ),
    );
    const withActivity = taskAck(
      await routeMutation(app, session, 'POST', `/api/tasks/${created.id}/activities`, 4, {
        message: '已电话催办',
      }),
    );
    const search = await app.inject({
      method: 'GET',
      url: '/api/tasks?text=%E8%88%AA%E7%A9%BA',
      headers: { cookie: session.cookie },
    });
    const deleted = taskAck(
      await routeMutation(app, session, 'DELETE', `/api/tasks/${created.id}`, 5, {}),
    );
    const trash = await app.inject({
      method: 'GET',
      url: '/api/trash',
      headers: { cookie: session.cookie },
    });
    const restored = taskAck(
      await routeMutation(app, session, 'POST', `/api/tasks/${created.id}/restore`, 6, {}),
    );

    expect(tagged.tags.map(({ name }) => name)).toEqual(['航空']);
    expect(updatedSubtask.subtasks[0]!.completed).toBe(true);
    expect(withActivity.activities[0]).toMatchObject({ kind: 'manual', message: '已电话催办' });
    expect(taskDtoSchema.array().parse(search.json()).map(({ id }) => id)).toContain(created.id);
    expect(deleted.deletedAt).not.toBeNull();
    expect(taskDtoSchema.array().parse(trash.json()).map(({ id }) => id)).toEqual([created.id]);
    expect(restored).toMatchObject({ version: 7, deletedAt: null });
  });
});

const taskAckSchema = mutationAckSchema(taskDtoSchema);

async function routeLogin(app: FastifyInstance) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: 'quality-pass' },
  });
  const header = response.headers['set-cookie'];
  const rawCookie = Array.isArray(header) ? header[0] : header;
  if (!rawCookie) throw new Error('Missing session cookie');
  return {
    cookie: rawCookie.split(';', 1)[0]!,
    csrfToken: (response.json() as { csrfToken: string }).csrfToken,
  };
}

async function routeMutation(
  app: FastifyInstance,
  session: { cookie: string; csrfToken: string },
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  baseVersion: number | null,
  data: object,
) {
  return app.inject({
    method,
    url,
    headers: {
      cookie: session.cookie,
      origin: 'https://todo.example.com',
      'x-csrf-token': session.csrfToken,
    },
    payload: { operationId: randomUUID(), baseVersion, data },
  });
}

function taskAck(response: Awaited<ReturnType<FastifyInstance['inject']>>) {
  expect(response.statusCode).toBeLessThan(300);
  return taskAckSchema.parse(response.json()).data;
}
