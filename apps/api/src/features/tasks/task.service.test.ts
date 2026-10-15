import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { createTestDatabase } from '../../db/testDatabase.js';
import { TaskService, VersionConflictError } from './task.service.js';

const userId = '7d831d11-27b9-42f3-bce7-005d4ed3c005';

describe('TaskService', () => {
  let database: AppDatabase;
  let now: Date;
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
    now = new Date('2026-10-15T02:00:00.000Z');
    service = new TaskService(database, { now: () => now }, userId);
  });

  afterEach(() => database.close());

  it('creates pending, normal, version-one tasks and records creation', () => {
    const task = service.create({ title: '跟进整改报告' }, randomUUID());

    expect(task).toMatchObject({
      title: '跟进整改报告',
      status: 'pending',
      priority: 'normal',
      version: 1,
    });
    expect(activityKinds(database, task.id)).toEqual(['created']);
  });

  it('increments the version when updating a task', () => {
    const task = service.create({ title: '旧标题' }, randomUUID());
    now = new Date('2026-10-15T03:00:00.000Z');

    const updated = service.update(task.id, 1, { title: '新标题' }, randomUUID());

    expect(updated).toMatchObject({ title: '新标题', version: 2 });
    expect(updated.updatedAt).toBe(now.toISOString());
  });

  it('rejects waiting status without both waiting fields', () => {
    const task = service.create({ title: '等待回复' }, randomUUID());

    expect(() =>
      service.update(task.id, 1, { status: 'waiting', waitingOn: '供应商' }, randomUUID()),
    ).toThrow();
  });

  it('sets completion and cancellation timestamps and persists an optional note', () => {
    const completedTask = service.create({ title: '完成检验' }, randomUUID());
    now = new Date('2026-10-15T04:00:00.000Z');
    const completed = service.transition(
      completedTask.id,
      1,
      { type: 'complete', completionNote: '报告已归档' },
      randomUUID(),
    );

    const cancelledTask = service.create({ title: '取消复核' }, randomUUID());
    now = new Date('2026-10-15T05:00:00.000Z');
    const cancelled = service.transition(
      cancelledTask.id,
      1,
      { type: 'cancel' },
      randomUUID(),
    );

    expect(completed).toMatchObject({
      status: 'completed',
      completedAt: '2026-10-15T04:00:00.000Z',
      completionNote: '报告已归档',
    });
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      cancelledAt: '2026-10-15T05:00:00.000Z',
    });
  });

  it('appends a system activity for every state change', () => {
    const task = service.create({ title: '状态流转' }, randomUUID());
    const started = service.transition(task.id, 1, { type: 'start' }, randomUUID());
    service.transition(started.id, 2, { type: 'cancel' }, randomUUID());

    expect(activityKinds(database, task.id)).toEqual(['created', 'status_changed', 'status_changed']);
  });

  it('replays the first result for a repeated operation ID without duplicate writes', () => {
    const operationId = randomUUID();
    const first = service.create({ title: '原始内容' }, operationId);
    const replayed = service.create({ title: '不应写入' }, operationId);

    expect(replayed).toEqual(first);
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM tasks').get()).toEqual({
      count: 1,
    });
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM activities').get()).toEqual({
      count: 1,
    });
  });

  it('returns server state for stale versions while current versions continue', () => {
    const task = service.create({ title: '初始标题' }, randomUUID());
    const current = service.update(task.id, 1, { title: '服务器标题' }, randomUUID());

    let conflict: VersionConflictError | undefined;
    try {
      service.update(task.id, 1, { title: '过期修改' }, randomUUID());
    } catch (error) {
      if (error instanceof VersionConflictError) {
        conflict = error;
      } else {
        throw error;
      }
    }

    expect(conflict?.server).toEqual(current);
    expect(conflict?.local).toMatchObject({ title: '过期修改', version: 1 });

    const next = service.update(task.id, 2, { title: '继续修改' }, randomUUID());
    expect(next).toMatchObject({ title: '继续修改', version: 3 });
  });
});

function activityKinds(database: AppDatabase, taskId: string): string[] {
  const rows = database.sqlite
    .prepare('SELECT kind FROM activities WHERE task_id = ? ORDER BY created_at, rowid')
    .all(taskId) as Array<{ kind: string }>;
  return rows.map(({ kind }) => kind);
}
