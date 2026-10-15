import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { verifyBackup } from './backup.js';

export async function pruneBackups(directory: string, keep = 14): Promise<string[]> {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(({ name }) => name)
    .sort()
    .reverse();
  const verified: string[] = [];
  for (const name of entries) if (await verifyBackup(join(directory, name))) verified.push(name);
  const removed = verified.slice(keep);
  await Promise.all(removed.map((name) => rm(join(directory, name), { recursive: true, force: true })));
  return removed;
}
