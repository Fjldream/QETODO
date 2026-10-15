import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { migrateDatabase } from './db/migrate.js';

const config = loadConfig();
const database = createDatabase(config.DATABASE_PATH);
migrateDatabase(database);

const app = buildApp({
  database,
  appOrigin: config.APP_ORIGIN,
  sessionTtlMs: config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1_000,
});

const close = async () => {
  await app.close();
  database.close();
};

process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());

await app.listen({ host: config.HOST, port: config.PORT });
