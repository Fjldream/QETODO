import { randomUUID } from 'node:crypto';

import { createDatabase } from '../src/db/client.js';
import { migrateDatabase } from '../src/db/migrate.js';
import { ScryptPasswordHasher } from '../src/features/auth/password.js';

const databasePath = process.env.DATABASE_PATH;
const username = process.env.ADMIN_USERNAME ?? 'admin';
const password = process.env.ADMIN_PASSWORD;

if (!databasePath || !password) {
  throw new Error('DATABASE_PATH and ADMIN_PASSWORD are required');
}

const database = createDatabase(databasePath);
try {
  migrateDatabase(database);
  const passwordHash = await new ScryptPasswordHasher().hash(password);
  const now = Date.now();
  database.sqlite
    .prepare(
      `INSERT INTO users (id, username, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash,
         updated_at = excluded.updated_at`,
    )
    .run(randomUUID(), username, passwordHash, now, now);
} finally {
  database.close();
}
