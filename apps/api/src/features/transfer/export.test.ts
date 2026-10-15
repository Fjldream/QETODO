import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { createTestDatabase } from '../../db/testDatabase.js';
import { ExportService } from './export.service.js';

const userId = '7d831d11-27b9-42f3-bce7-005d4ed3c005';

describe('ExportService', () => {
  let database: AppDatabase;

  beforeEach(() => {
    database = createTestDatabase();
    migrateDatabase(database);
    database.sqlite.prepare("INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, 'admin', 'secret-hash', 1, 1)").run(userId);
    const taskId = randomUUID();
    database.sqlite.prepare(`INSERT INTO tasks
      (id,user_id,title,description,status,priority,due_at,waiting_on,follow_up_at,reference,recurrence_kind,recurrence_interval,created_at,updated_at,version)
      VALUES (?, ?, '=危险公式', '内部说明', 'waiting', 'important', ?, '供应商', ?, 'XH300', 'none', 1, 1, 1, 1)`)
      .run(taskId, userId, Date.parse('2026-10-20T01:00:00Z'), Date.parse('2026-10-16T01:00:00Z'));
    database.sqlite.prepare("INSERT INTO tags (id,user_id,name,color,created_at) VALUES (?,?,'外协',NULL,1)").run(randomUUID(), userId);
    const tagId = database.sqlite.prepare('SELECT id FROM tags').pluck().get() as string;
    database.sqlite.prepare('INSERT INTO task_tags (task_id,tag_id) VALUES (?,?)').run(taskId, tagId);
  });

  afterEach(() => database.close());

  it('exports BOM-prefixed, formula-safe CSV with quality-management columns', () => {
    const csv = new ExportService(database, { now: () => new Date('2026-10-15T02:00:00Z') }).toCsv(userId);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('标题,状态,截止时间,标签,等待对象,下次跟进,关联编号');
    expect(csv).toContain("'=危险公式");
    expect(csv).toContain('外协');
    expect(csv).toContain('供应商');
    expect(csv).toContain('XH300');
  });

  it('exports versioned JSON with task relations but no password or session secrets', async () => {
    const bundle = await new ExportService(database, { now: () => new Date('2026-10-15T02:00:00Z') }).toJson(userId, 'unused');
    const serialized = JSON.stringify(bundle);
    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.tasks).toHaveLength(1);
    expect(bundle.tasks[0]?.tags[0]?.name).toBe('外协');
    expect(serialized).not.toContain('secret-hash');
    expect(serialized).not.toContain('csrf');
  });
});
