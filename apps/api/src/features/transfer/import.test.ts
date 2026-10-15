import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ExportBundle } from '@qetodo/contracts';
import type { AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { createTestDatabase } from '../../db/testDatabase.js';
import { ImportService } from './import.service.js';

const userId = '7d831d11-27b9-42f3-bce7-005d4ed3c005';

describe('ImportService', () => {
  let database: AppDatabase;
  let uploadDir: string;

  beforeEach(() => {
    database = createTestDatabase();
    migrateDatabase(database);
    uploadDir = mkdtempSync(join(tmpdir(), 'qetodo-import-'));
    database.sqlite.prepare("INSERT INTO users (id,username,password_hash,created_at,updated_at) VALUES (?,'admin','hash',1,1)").run(userId);
    database.sqlite.prepare(`INSERT INTO tasks (id,user_id,title,description,status,priority,recurrence_kind,recurrence_interval,created_at,updated_at,version)
      VALUES (?,?, '现有数据','', 'pending','normal','none',1,1,1,1)`).run(randomUUID(), userId);
  });

  afterEach(() => { database.close(); rmSync(uploadDir, { recursive: true, force: true }); });

  it('validates the entire bundle before writes and leaves live data unchanged on bad schema/checksum', async () => {
    const service = new ImportService(database, uploadDir);
    await expect(service.apply(userId, { schemaVersion: 2 })).rejects.toBeTruthy();
    await expect(service.apply(userId, bundle({ checksum: '0'.repeat(64) }))).rejects.toThrow('附件校验失败');
    expect(database.sqlite.prepare('SELECT title FROM tasks').pluck().all()).toEqual(['现有数据']);
  });

  it('imports transactionally and handles duplicate IDs deterministically', async () => {
    const service = new ImportService(database, uploadDir);
    const value = bundle();
    const first = await service.apply(userId, value);
    const second = await service.apply(userId, value);
    expect(first.tasks).toBe(1);
    expect(second.tasks).toBe(1);
    expect(database.sqlite.prepare('SELECT count(*) FROM tasks WHERE user_id = ?').pluck().get(userId)).toBe(1);
  });
});

function bundle(overrides: { checksum?: string } = {}): ExportBundle {
  const taskId = randomUUID();
  const attachmentId = randomUUID();
  const bytes = Buffer.from('image-bytes');
  return {
    schemaVersion: 1,
    exportedAt: '2026-10-15T02:00:00.000Z',
    tasks: [{
      id: taskId, title: '导入任务', description: '', status: 'pending', priority: 'normal', dueAt: null,
      reminderTimes: [], waitingOn: null, followUpAt: null, reference: null, tagIds: [], tags: [], subtasks: [], activities: [],
      recurrence: { kind: 'none' }, recurrenceSeriesId: null,
      attachments: [{ id: attachmentId, taskId, fileName: 'evidence.png', mediaType: 'image/png', byteSize: bytes.length, width: 1, height: 1, createdAt: '2026-10-15T02:00:00.000Z' }],
      createdAt: '2026-10-15T02:00:00.000Z', updatedAt: '2026-10-15T02:00:00.000Z', completedAt: null, cancelledAt: null, deletedAt: null, version: 1,
    }],
    attachmentFiles: [{ attachmentId, taskId, checksum: overrides.checksum ?? createHash('sha256').update(bytes).digest('hex'), dataBase64: bytes.toString('base64') }],
  };
}
