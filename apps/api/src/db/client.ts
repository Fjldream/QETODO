import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema.js';

export interface AppDatabase {
  filename: string;
  sqlite: Database.Database;
  orm: BetterSQLite3Database<typeof schema>;
  close(): void;
}

export function createDatabase(path: string): AppDatabase {
  const filename = path === ':memory:' ? path : resolve(path);
  if (filename !== ':memory:') {
    mkdirSync(dirname(filename), { recursive: true });
  }

  const sqlite = new Database(filename);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  return {
    filename,
    sqlite,
    orm: drizzle(sqlite, { schema }),
    close: () => sqlite.close(),
  };
}
