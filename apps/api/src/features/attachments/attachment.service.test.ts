import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { createTestDatabase } from '../../db/testDatabase.js';
import { AttachmentRepository } from './attachment.repository.js';
import { AttachmentService } from './attachment.service.js';
import { AttachmentStorage } from './attachment.storage.js';

const userId = '7d831d11-27b9-42f3-bce7-005d4ed3c005';
const taskId = '9018031a-c553-49fb-9fbd-6d0471a7f107';
const otherTaskId = 'ea159d72-e2dd-433d-9de6-67ddef654a6f';

describe('AttachmentService', () => {
  let database: AppDatabase;
  let directory: string;
  let service: AttachmentService;

  beforeEach(() => {
    database = createTestDatabase();
    migrateDatabase(database);
    directory = mkdtempSync(join(tmpdir(), 'qetodo-attachments-'));
    seed(database, taskId, '任务正文不能回滚');
    seed(database, otherTaskId, '另一条任务');
    service = new AttachmentService(
      new AttachmentRepository(database),
      new AttachmentStorage(directory),
      { now: () => new Date('2026-10-15T02:00:00.000Z') },
    );
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('uses magic bytes, rejects invalid data and oversized dimensions, and preserves task text', async () => {
    await expect(service.attach(userId, taskId, { fileName: 'fake.jpg', bytes: Buffer.from('not-an-image') })).rejects.toMatchObject({ statusCode: 415 });
    await expect(service.attach(userId, taskId, { fileName: 'bomb.png', bytes: png(10_000, 10_000) })).rejects.toMatchObject({ statusCode: 413 });
    expect(database.sqlite.prepare('SELECT title FROM tasks WHERE id = ?').pluck().get(taskId)).toBe('任务正文不能回滚');
  });

  it('accepts at most six images and scopes attachment IDs to their owning task', async () => {
    const created = [];
    for (let index = 0; index < 6; index += 1) {
      created.push(await service.attach(userId, taskId, { fileName: `evidence-${index}.png`, bytes: png(1, 1) }));
    }
    await expect(service.attach(userId, taskId, { fileName: 'seventh.png', bytes: png(1, 1) })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.read(userId, otherTaskId, created[0]!.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});

function seed(database: AppDatabase, id: string, title: string): void {
  database.sqlite.prepare('INSERT OR IGNORE INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, 1, 1)').run(userId, 'admin', 'hash');
  database.sqlite.prepare(`INSERT INTO tasks
    (id, user_id, title, description, status, priority, recurrence_kind, recurrence_interval, created_at, updated_at, version)
    VALUES (?, ?, ?, '', 'pending', 'normal', 'none', 1, 1, 1, 1)`).run(id, userId, title);
}

function png(width: number, height: number): Buffer {
  const bytes = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}
