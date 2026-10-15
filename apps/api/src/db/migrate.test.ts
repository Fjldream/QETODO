import type { AppDatabase } from './client.js';
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

    expect(rows.map(({ name }) => name)).toEqual(expectedTables);
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
    expect(count.count).toBe(1);
  });
});
