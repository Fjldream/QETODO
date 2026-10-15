import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildApp } from '../../apps/api/src/app.js';
import { createDatabase } from '../../apps/api/src/db/client.js';
import { migrateDatabase } from '../../apps/api/src/db/migrate.js';
import { ScryptPasswordHasher } from '../../apps/api/src/features/auth/password.js';

const dataRoot = resolve('.e2e-data');
await rm(dataRoot, { recursive: true, force: true });
await mkdir(dataRoot, { recursive: true });
const database = createDatabase(resolve(dataRoot, 'app.sqlite'));
migrateDatabase(database);
const passwordHash = await new ScryptPasswordHasher().hash('quality-pass');
database.sqlite.prepare(`INSERT INTO users (id,username,password_hash,created_at,updated_at)
  VALUES ('7d831d11-27b9-42f3-bce7-005d4ed3c005','admin',?,?,?)`).run(passwordHash, Date.now(), Date.now());
const app = buildApp({
  database,
  appOrigin: 'http://127.0.0.1:4173',
  uploadDir: resolve(dataRoot, 'uploads'),
  backupDir: resolve(dataRoot, 'backups'),
});

const close = async () => { await app.close(); database.close(); };
process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());
await app.listen({ host: '127.0.0.1', port: 3000 });
