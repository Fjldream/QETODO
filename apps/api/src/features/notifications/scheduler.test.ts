import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { createTestDatabase } from '../../db/testDatabase.js';
import { PushRepository } from './push.repository.js';
import { NotificationScheduler } from './scheduler.js';

const userId = '7d831d11-27b9-42f3-bce7-005d4ed3c005';

describe('NotificationScheduler', () => {
  let database: AppDatabase;

  beforeEach(() => {
    database = createTestDatabase();
    migrateDatabase(database);
    database.sqlite.prepare(`INSERT INTO users (id, username, password_hash, created_at, updated_at)
      VALUES (?, 'admin', 'hash', 1, 1)`).run(userId);
  });

  afterEach(() => database.close());

  it('sends due and waiting reminders once with privacy-limited payloads', async () => {
    const dueTask = seedTask(database, { title: '复核尺寸', dueAt: Date.parse('2026-10-15T16:01:00.000Z'), description: '机密说明', reference: 'XH300' });
    const waitingTask = seedTask(database, { title: '等待供应商报告', status: 'waiting', waitingOn: '供应商', followUpAt: Date.parse('2026-10-15T15:59:00.000Z') });
    database.sqlite.prepare('INSERT INTO reminders (id, task_id, remind_at, sent_at, created_at) VALUES (?, ?, ?, NULL, 1)').run(randomUUID(), dueTask, Date.parse('2026-10-15T15:58:00.000Z'));
    new PushRepository(database).upsert(userId, subscription('one'), 1);
    const send = vi.fn(async () => ({ status: 'sent' as const }));
    const scheduler = new NotificationScheduler(database, { send }, 'Asia/Shanghai');

    const first = await scheduler.tick(new Date('2026-10-15T16:00:00.000Z'));
    const second = await scheduler.tick(new Date('2026-10-15T16:00:30.000Z'));

    expect(first.sent).toBe(2);
    expect(second.sent).toBe(0);
    expect(send).toHaveBeenCalledTimes(2);
    for (const [, payload] of send.mock.calls) {
      expect(JSON.stringify(payload)).not.toContain('机密说明');
      expect(JSON.stringify(payload)).not.toContain('XH300');
      expect(payload).toEqual(expect.objectContaining({ title: '质量待办提醒', taskId: expect.any(String) }));
    }
    expect(send.mock.calls.map(([, payload]) => payload.body)).toEqual(expect.arrayContaining(['复核尺寸', '等待供应商报告']));
    expect(waitingTask).toBeTruthy();
  });

  it('retries failed sends without duplicating success and removes revoked subscriptions', async () => {
    const taskId = seedTask(database, { title: '到期提醒', dueAt: 1 });
    database.sqlite.prepare('INSERT INTO reminders (id, task_id, remind_at, sent_at, created_at) VALUES (?, ?, 1, NULL, 1)').run(randomUUID(), taskId);
    const pushes = new PushRepository(database);
    pushes.upsert(userId, subscription('ok'), 1);
    pushes.upsert(userId, subscription('retry'), 1);
    pushes.upsert(userId, subscription('gone'), 1);
    let retryAttempt = 0;
    const send = vi.fn(async (target: { endpoint: string }) => {
      if (target.endpoint.endsWith('gone')) return { status: 'gone' as const };
      if (target.endpoint.endsWith('retry') && retryAttempt++ === 0) throw new Error('temporary');
      return { status: 'sent' as const };
    });
    const scheduler = new NotificationScheduler(database, { send }, 'Asia/Shanghai');

    await scheduler.tick(new Date(10));
    await scheduler.tick(new Date(20));

    expect(send.mock.calls.filter(([target]) => target.endpoint.endsWith('ok'))).toHaveLength(1);
    expect(send.mock.calls.filter(([target]) => target.endpoint.endsWith('retry'))).toHaveLength(2);
    expect(pushes.listForUser(userId).some(({ endpoint }) => endpoint.endsWith('gone'))).toBe(false);
  });

  it('creates only one next recurrence across repeated ticks and sends an unfinished-overdue digest', async () => {
    const seriesId = randomUUID();
    seedTask(database, { title: '每月校准', dueAt: Date.parse('2026-09-30T01:00:00.000Z'), status: 'completed', recurrenceKind: 'monthly', recurrenceSeriesId: seriesId, occurrenceDate: '2026-09-30' });
    seedTask(database, { title: '逾期未完成', dueAt: Date.parse('2026-10-14T01:00:00.000Z') });
    seedTask(database, { title: '已完成旧任务', dueAt: Date.parse('2026-10-14T01:00:00.000Z'), status: 'completed' });
    new PushRepository(database).upsert(userId, subscription('digest'), 1);
    const send = vi.fn(async () => ({ status: 'sent' as const }));
    const scheduler = new NotificationScheduler(database, { send }, 'Asia/Shanghai');

    await scheduler.tick(new Date('2026-10-15T01:00:00.000Z'));
    await scheduler.tick(new Date('2026-10-15T01:00:30.000Z'));

    expect(database.sqlite.prepare('SELECT count(*) FROM tasks WHERE recurrence_series_id = ?').pluck().get(seriesId)).toBe(2);
    const digest = send.mock.calls.map(([, payload]) => payload).find(({ kind }) => kind === 'overdue-digest');
    expect(digest?.body).toContain('逾期未完成');
    expect(digest?.body).not.toContain('已完成旧任务');
  });
});

function subscription(suffix: string) {
  return { endpoint: `https://push.example/${suffix}`, p256dh: 'p256dh', auth: 'auth' };
}

function seedTask(database: AppDatabase, patch: Record<string, unknown>): string {
  const id = randomUUID();
  database.sqlite.prepare(`INSERT INTO tasks
    (id, user_id, title, description, status, priority, due_at, waiting_on, follow_up_at, reference,
     recurrence_kind, recurrence_interval, recurrence_series_id, occurrence_date, created_at, updated_at,
     completed_at, version)
    VALUES (@id, @userId, @title, @description, @status, 'normal', @dueAt, @waitingOn, @followUpAt, @reference,
      @recurrenceKind, 1, @recurrenceSeriesId, @occurrenceDate, 1, 1, @completedAt, 1)`)
    .run({
      id,
      userId,
      title: '任务',
      description: '',
      status: 'pending',
      dueAt: null,
      waitingOn: null,
      followUpAt: null,
      reference: null,
      recurrenceKind: 'none',
      recurrenceSeriesId: null,
      occurrenceDate: null,
      completedAt: null,
      ...patch,
    });
  return id;
}
