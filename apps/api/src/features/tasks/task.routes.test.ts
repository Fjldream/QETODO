import { randomUUID } from 'node:crypto';

import {
  conflictResponseSchema,
  mutationAckSchema,
  taskDtoSchema,
} from '@qetodo/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import type { AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { createTestDatabase } from '../../db/testDatabase.js';
import { ScryptPasswordHasher } from '../auth/password.js';

const taskAckSchema = mutationAckSchema(taskDtoSchema);

describe('task routes', () => {
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
         VALUES ('7d831d11-27b9-42f3-bce7-005d4ed3c005', 'admin', ?, 1, 1)`,
      )
      .run(passwordHash);
    app = buildApp({
      database,
      appOrigin: 'https://todo.example.com',
      clock: { now: () => new Date('2026-10-15T02:00:00.000Z') },
    });
    session = await login(app);
  });

  afterEach(async () => {
    await app.close();
    database.close();
  });

  it('requires authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/tasks' });

    expect(response.statusCode).toBe(401);
  });

  it('creates, gets, lists, patches, completes, cancels, and restores contract-valid tasks', async () => {
    const created = await createTask(app, session, '供应商整改');
    const createdAck = taskAckSchema.parse(created.json());

    const fetched = await app.inject({
      method: 'GET',
      url: `/api/tasks/${createdAck.data.id}`,
      headers: { cookie: session.cookie },
    });
    const listed = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { cookie: session.cookie },
    });
    const patched = await mutate(app, session, 'PATCH', `/api/tasks/${createdAck.data.id}`, {
      operationId: randomUUID(),
      baseVersion: 1,
      data: { title: '供应商整改（已催办）' },
    });
    const completed = await mutate(
      app,
      session,
      'POST',
      `/api/tasks/${createdAck.data.id}/transitions`,
      {
        operationId: randomUUID(),
        baseVersion: 2,
        data: { type: 'complete', completionNote: '报告已收到' },
      },
    );

    const second = taskAckSchema.parse((await createTask(app, session, '停止复核')).json());
    const cancelled = await mutate(
      app,
      session,
      'POST',
      `/api/tasks/${second.data.id}/transitions`,
      { operationId: randomUUID(), baseVersion: 1, data: { type: 'cancel' } },
    );
    const restored = await mutate(
      app,
      session,
      'POST',
      `/api/tasks/${second.data.id}/transitions`,
      { operationId: randomUUID(), baseVersion: 2, data: { type: 'restore' } },
    );

    expect(created.statusCode).toBe(201);
    expect(taskDtoSchema.parse(fetched.json())).toEqual(createdAck.data);
    expect(taskDtoSchema.array().parse(listed.json())).toHaveLength(1);
    expect(taskAckSchema.parse(patched.json()).data).toMatchObject({
      title: '供应商整改（已催办）',
      version: 2,
    });
    expect(taskAckSchema.parse(completed.json()).data).toMatchObject({
      status: 'completed',
      completionNote: '报告已收到',
    });
    expect(taskAckSchema.parse(cancelled.json()).data.status).toBe('cancelled');
    expect(taskAckSchema.parse(restored.json()).data.status).toBe('pending');
  });

  it('returns structured 400 responses for invalid bodies', async () => {
    const response = await mutate(app, session, 'POST', '/api/tasks', {
      operationId: 'not-a-uuid',
      baseVersion: null,
      data: { title: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'INVALID_REQUEST',
      issues: expect.any(Array),
    });
  });

  it('returns 404 for absent tasks', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/tasks/${randomUUID()}`,
      headers: { cookie: session.cookie },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'TASK_NOT_FOUND' });
  });

  it('returns a contract-valid 409 conflict with local and server versions', async () => {
    const created = taskAckSchema.parse((await createTask(app, session, '版本测试')).json());
    await mutate(app, session, 'PATCH', `/api/tasks/${created.data.id}`, {
      operationId: randomUUID(),
      baseVersion: 1,
      data: { title: '服务器修改' },
    });

    const response = await mutate(app, session, 'PATCH', `/api/tasks/${created.data.id}`, {
      operationId: randomUUID(),
      baseVersion: 1,
      data: { title: '离线修改' },
    });
    const conflict = conflictResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(409);
    expect(conflict.local.title).toBe('离线修改');
    expect(conflict.server.title).toBe('服务器修改');
  });
});

async function login(app: FastifyInstance) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: 'quality-pass' },
  });
  const setCookie = response.headers['set-cookie'];
  const rawCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!rawCookie) throw new Error('Missing session cookie');
  return {
    cookie: rawCookie.split(';', 1)[0]!,
    csrfToken: (response.json() as { csrfToken: string }).csrfToken,
  };
}

async function createTask(
  app: FastifyInstance,
  session: { cookie: string; csrfToken: string },
  title: string,
) {
  return mutate(app, session, 'POST', '/api/tasks', {
    operationId: randomUUID(),
    baseVersion: null,
    data: { title },
  });
}

async function mutate(
  app: FastifyInstance,
  session: { cookie: string; csrfToken: string },
  method: 'POST' | 'PATCH',
  url: string,
  payload: object,
) {
  return app.inject({
    method,
    url,
    headers: {
      cookie: session.cookie,
      origin: 'https://todo.example.com',
      'x-csrf-token': session.csrfToken,
    },
    payload,
  });
}
