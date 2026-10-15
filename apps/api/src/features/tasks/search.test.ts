import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { createTestDatabase } from '../../db/testDatabase.js';
import { TaskSearchRepository } from './search.repository.js';
import { TaskService } from './task.service.js';

const userId = '7d831d11-27b9-42f3-bce7-005d4ed3c005';

describe('task search', () => {
  let database: AppDatabase;
  let service: TaskService;
  let search: TaskSearchRepository;

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
    search = new TaskSearchRepository(database, userId);
  });

  afterEach(() => database.close());

  it.each([
    ['供应商整改', { title: '供应商整改确认' }],
    ['CAPA', { title: '描述命中', description: 'Review CAPA evidence' }],
    ['航空', { title: '标签命中', tags: ['航空'] }],
    ['NCR-108', { title: '编号命中', reference: 'NCR-108' }],
    ['张工', {
      title: '等待对象命中',
      status: 'waiting' as const,
      waitingOn: '张工',
      followUpAt: '2026-10-16T02:00:00.000Z',
    }],
  ])('matches %s across indexed task fields', (query, input) => {
    const { tags = [], ...taskInput } = input as typeof input & { tags?: string[] };
    const task = service.create(taskInput, randomUUID());
    if (tags.length) service.setTags(task.id, 1, tags, randomUUID());

    expect(search.search({ text: query }).map(({ id }) => id)).toContain(task.id);
  });

  it('composes status, priority, tag, date, and waiting-person filters', () => {
    const matching = service.create(
      {
        title: '组合筛选',
        status: 'waiting',
        priority: 'urgent',
        dueAt: '2026-10-20T02:00:00.000Z',
        waitingOn: '李工',
        followUpAt: '2026-10-16T02:00:00.000Z',
      },
      randomUUID(),
    );
    service.setTags(matching.id, 1, ['外协'], randomUUID());
    service.create({ title: '不匹配', priority: 'urgent' }, randomUUID());

    const results = search.search({
      statuses: ['waiting'],
      priorities: ['urgent'],
      tag: '外协',
      dueFrom: '2026-10-20T00:00:00.000Z',
      dueTo: '2026-10-21T00:00:00.000Z',
      waitingOn: '李工',
    });

    expect(results.map(({ id }) => id)).toEqual([matching.id]);
  });

  it('excludes completed and cancelled tasks from active defaults', () => {
    const completed = service.create({ title: '已完成' }, randomUUID());
    const cancelled = service.create({ title: '已取消' }, randomUUID());
    service.transition(completed.id, 1, { type: 'complete' }, randomUUID());
    service.transition(cancelled.id, 1, { type: 'cancel' }, randomUUID());

    expect(search.search({})).toEqual([]);
  });
});
