import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { createTestDatabase } from '../../db/testDatabase.js';
import { TaskService } from './task.service.js';
import { TrashService } from './trash.service.js';

const userId = '7d831d11-27b9-42f3-bce7-005d4ed3c005';

describe('task trash', () => {
  let database: AppDatabase;
  let now: Date;
  let service: TaskService;
  let trash: TrashService;

  beforeEach(() => {
    database = createTestDatabase();
    migrateDatabase(database);
    database.sqlite
      .prepare(
        `INSERT INTO users (id, username, password_hash, created_at, updated_at)
         VALUES (?, 'admin', 'hash', 1, 1)`,
      )
      .run(userId);
    now = new Date('2026-10-15T02:00:00.000Z');
    service = new TaskService(database, { now: () => now }, userId);
    trash = new TrashService(database, userId);
  });

  afterEach(() => database.close());

  it('hides soft-deleted tasks and restores them', () => {
    const task = service.create({ title: '误删任务' }, randomUUID());
    const deleted = service.softDelete(task.id, 1, randomUUID());

    expect(deleted.deletedAt).toBe(now.toISOString());
    expect(service.list()).toEqual([]);
    expect(trash.list().map(({ id }) => id)).toEqual([task.id]);

    const restored = service.restoreDeleted(task.id, 2, randomUUID());
    expect(restored.deletedAt).toBeNull();
    expect(service.list().map(({ id }) => id)).toEqual([task.id]);
  });

  it('purges only tasks deleted more than 30 days ago', () => {
    const oldTask = service.create({ title: '过期删除' }, randomUUID());
    service.softDelete(oldTask.id, 1, randomUUID());
    now = new Date('2026-11-14T02:00:00.000Z');
    const boundaryTask = service.create({ title: '刚满三十天' }, randomUUID());
    service.softDelete(boundaryTask.id, 1, randomUUID());

    now = new Date('2026-12-14T02:00:00.000Z');
    expect(trash.purgeExpired(now)).toBe(1);
    expect(trash.list().map(({ id }) => id)).toEqual([boundaryTask.id]);
  });
});
