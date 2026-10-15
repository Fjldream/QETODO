import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDatabase, type AppDatabase } from './client.js';

export function createTestDatabase(): AppDatabase {
  const directory = mkdtempSync(join(tmpdir(), 'qetodo-test-'));
  const database = createDatabase(join(directory, 'app.db'));
  let closed = false;

  return {
    ...database,
    close: () => {
      if (closed) {
        return;
      }

      closed = true;
      database.close();
      rmSync(directory, { force: true, recursive: true });
    },
  };
}
