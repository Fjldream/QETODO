import type { AppDatabase } from './client.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migrateDatabase } from './migrate.js';
import { createTestDatabase } from './testDatabase.js';

describe('database constraints', () => {
  let database: AppDatabase;

  beforeEach(() => {
    database = createTestDatabase();
    migrateDatabase(database);
    database.sqlite
      .prepare(
        `INSERT INTO users (id, username, password_hash, created_at, updated_at)
         VALUES ('user-1', 'admin', 'hash', 1, 1)`,
      )
      .run();
  });

  afterEach(() => database.close());

  it('enables WAL, foreign keys, and a busy timeout', () => {
    const journalMode = database.sqlite.pragma('journal_mode', { simple: true });
    const foreignKeys = database.sqlite.pragma('foreign_keys', { simple: true });
    const busyTimeout = database.sqlite.pragma('busy_timeout', { simple: true });

    expect(journalMode).toBe('wal');
    expect(foreignKeys).toBe(1);
    expect(busyTimeout).toBeGreaterThanOrEqual(5_000);
  });

  it('cascades task-owned rows when a task is removed', () => {
    insertTask(database, 'task-1');
    database.sqlite
      .prepare(
        `INSERT INTO subtasks (id, task_id, title, completed, sort_order, created_at, updated_at)
         VALUES ('subtask-1', 'task-1', '核对报告', 0, 0, 1, 1)`,
      )
      .run();

    database.sqlite.prepare("DELETE FROM tasks WHERE id = 'task-1'").run();

    const row = database.sqlite.prepare('SELECT id FROM subtasks').get();
    expect(row).toBeUndefined();
  });

  it('prevents duplicate recurrence occurrences', () => {
    insertTask(database, 'task-1', 'series-1', '2026-10-15');

    expect(() => insertTask(database, 'task-2', 'series-1', '2026-10-15')).toThrow(
      /UNIQUE constraint failed/,
    );
  });

  it('prevents duplicate operation IDs', () => {
    const insert = database.sqlite.prepare(
      `INSERT INTO idempotency_keys
       (operation_id, user_id, operation_type, response_status, response_body, created_at)
       VALUES (?, 'user-1', 'task.create', 201, '{}', 1)`,
    );
    insert.run('20c6b6a2-ca9d-4fb6-9961-f2128482f01d');

    expect(() => insert.run('20c6b6a2-ca9d-4fb6-9961-f2128482f01d')).toThrow(
      /UNIQUE constraint failed/,
    );
  });
});

function insertTask(
  database: AppDatabase,
  id: string,
  recurrenceSeriesId: string | null = null,
  occurrenceDate: string | null = null,
): void {
  database.sqlite
    .prepare(
      `INSERT INTO tasks
       (id, user_id, title, description, status, priority, recurrence_kind,
        recurrence_series_id, occurrence_date, created_at, updated_at, version)
       VALUES (?, 'user-1', '跟进整改', '', 'pending', 'normal', 'none', ?, ?, 1, 1, 1)`,
    )
    .run(id, recurrenceSeriesId, occurrenceDate);
}
