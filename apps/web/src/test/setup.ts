import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import { localDb } from '../db/localDb.js';

afterEach(async () => {
  cleanup();
  await Promise.all([localDb.tasks.clear(), localDb.outbox.clear(), localDb.metadata.clear()]);
});
