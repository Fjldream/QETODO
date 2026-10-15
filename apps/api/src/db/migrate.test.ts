import type { AppDatabase } from './client.js';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

import { migrateDatabase } from './migrate.js';
import { createTestDatabase } from './testDatabase.js';

const expectedTables = [
  'activities',
  'attachments',
  'idempotency_keys',
  'push_subscriptions',
  'reminders',
  'sessions',
  'subtasks',
  'tags',
  'task_tags',
  'tasks',
  'users',
];

describe('database migration', () => {
  let database: AppDatabase | undefined;

  afterEach(() => database?.close());

  it('creates every application table', () => {
    database = createTestDatabase();
    migrateDatabase(database);

    const rows = database.sqlite
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>;

    expect(rows.map(({ name }) => name)).toEqual(expect.arrayContaining(expectedTables));
  });

  it('upgrades a populated legacy database without changing task fields', () => {
    database = createTestDatabase();
    database.sqlite.exec('CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL) STRICT');
    for (const [id, file] of [[1, '0001_initial.sql'], [2, '0002_task_search.sql'], [3, '0003_notifications.sql']] as const) {
      database.sqlite.exec(readFileSync(new URL(`../../migrations/${file}`, import.meta.url), 'utf8'));
      database.sqlite.prepare('INSERT INTO schema_migrations VALUES (?, 1)').run(id);
    }
    database.sqlite.exec(`INSERT INTO users VALUES ('legacy-user', 'admin', 'hash', 1, 1);
      INSERT INTO tasks (id,user_id,title,status,priority,due_at,created_at,updated_at)
      VALUES ('legacy-task','legacy-user','保留任务','pending','normal',1792745100000,1,1)`);
    migrateDatabase(database);
    expect(database.sqlite.prepare('SELECT title, due_at, planned_date, version FROM tasks').get()).toEqual({ title: '保留任务', due_at: 1792745100000, planned_date: null, version: 1 });
  });

  it('applies migrations only once', () => {
    database = createTestDatabase();

    expect(() => {
      migrateDatabase(database!);
      migrateDatabase(database!);
    }).not.toThrow();

    const count = database.sqlite
      .prepare('SELECT COUNT(*) AS count FROM schema_migrations')
      .get() as { count: number };
    expect(count.count).toBe(4);
  });
});
