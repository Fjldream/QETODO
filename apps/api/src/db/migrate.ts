import { readFileSync } from 'node:fs';

import type { AppDatabase } from './client.js';

const migrations = [
  {
    id: 1,
    file: new URL('../../migrations/0001_initial.sql', import.meta.url),
  },
  {
    id: 2,
    file: new URL('../../migrations/0002_task_search.sql', import.meta.url),
  },
  {
    id: 3,
    file: new URL('../../migrations/0003_notifications.sql', import.meta.url),
  },
] as const;

export function migrateDatabase(database: AppDatabase): void {
  database.sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    ) STRICT;
  `);

  const applied = database.sqlite
    .prepare('SELECT 1 FROM schema_migrations WHERE id = ?')
    .pluck();
  const record = database.sqlite.prepare(
    'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
  );

  for (const migration of migrations) {
    if (applied.get(migration.id)) {
      continue;
    }

    const sql = readFileSync(migration.file, 'utf8');
    database.sqlite.transaction(() => {
      database.sqlite.exec(sql);
      record.run(migration.id, Date.now());
    })();
  }
}
