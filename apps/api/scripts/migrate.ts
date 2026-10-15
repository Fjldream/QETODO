import { createDatabase } from '../src/db/client.js';
import { migrateDatabase } from '../src/db/migrate.js';

const databasePath = process.env.DATABASE_PATH;
if (!databasePath) throw new Error('DATABASE_PATH is required');

const database = createDatabase(databasePath);
try {
  migrateDatabase(database);
  console.log(`Database migrated: ${databasePath}`);
} finally {
  database.close();
}
