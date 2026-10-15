import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import type { AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { createTestDatabase } from '../../db/testDatabase.js';
import { ScryptPasswordHasher } from '../auth/password.js';

describe('attachment routes', () => {
  let app: FastifyInstance;
  let database: AppDatabase;
  let uploadDir: string;
  let session: { cookie: string; csrfToken: string };
  let taskId: string;

  beforeEach(async () => {
    database = createTestDatabase();
    migrateDatabase(database);
    uploadDir = mkdtempSync(join(tmpdir(), 'qetodo-route-attachments-'));
    const passwordHash = await new ScryptPasswordHasher().hash('quality-pass');
    database.sqlite.prepare(`INSERT INTO users (id, username, password_hash, created_at, updated_at)
      VALUES ('7d831d11-27b9-42f3-bce7-005d4ed3c005', 'admin', ?, 1, 1)`).run(passwordHash);
    taskId = randomUUID();
    database.sqlite.prepare(`INSERT INTO tasks
      (id, user_id, title, description, status, priority, recurrence_kind, recurrence_interval, created_at, updated_at, version)
      VALUES (?, '7d831d11-27b9-42f3-bce7-005d4ed3c005', '证据任务', '', 'pending', 'normal', 'none', 1, 1, 1, 1)`).run(taskId);
    app = buildApp({ database, appOrigin: 'https://todo.example.com', uploadDir });
    session = await login(app);
  });

  afterEach(async () => {
    await app.close();
    database.close();
    rmSync(uploadDir, { recursive: true, force: true });
  });

  it('rejects invalid magic bytes and oversized multipart bodies', async () => {
    const invalid = await upload(app, session, taskId, 'fake.jpg', Buffer.from('not an image'));
    const oversized = await upload(app, session, taskId, 'large.png', Buffer.alloc(1_000_001, 1));

    expect(invalid.statusCode).toBe(415);
    expect(oversized.statusCode).toBe(413);
  });

  it('requires authentication to read private image content and sets safe headers when authenticated', async () => {
    const created = await upload(app, session, taskId, '现场 证据.png', png());
    expect(created.statusCode).toBe(201);
    const attachment = created.json() as { id: string };
    const url = `/api/tasks/${taskId}/attachments/${attachment.id}/content`;

    const anonymous = await app.inject({ method: 'GET', url });
    const authenticated = await app.inject({ method: 'GET', url, headers: { cookie: session.cookie } });

    expect(anonymous.statusCode).toBe(401);
    expect(authenticated.statusCode).toBe(200);
    expect(authenticated.headers['content-type']).toBe('image/png');
    expect(authenticated.headers['x-content-type-options']).toBe('nosniff');
    expect(authenticated.headers['cache-control']).toContain('private');
  });
});

async function login(app: FastifyInstance) {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'quality-pass' } });
  const cookie = response.headers['set-cookie'];
  const raw = Array.isArray(cookie) ? cookie[0] : cookie;
  if (!raw) throw new Error('Missing cookie');
  return { cookie: raw.split(';', 1)[0]!, csrfToken: (response.json() as { csrfToken: string }).csrfToken };
}

async function upload(app: FastifyInstance, session: { cookie: string; csrfToken: string }, id: string, fileName: string, bytes: Buffer) {
  const boundary = `----qetodo-${randomUUID()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({
    method: 'POST',
    url: `/api/tasks/${id}/attachments`,
    headers: {
      cookie: session.cookie,
      origin: 'https://todo.example.com',
      'x-csrf-token': session.csrfToken,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: body,
  });
}

function png(): Buffer {
  return Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
}
