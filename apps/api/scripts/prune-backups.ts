import { readdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';

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

if (process.argv[1] && basename(process.argv[1]).startsWith('prune-backups')) {
  const [directory, keepValue] = process.argv.slice(2);
  if (!directory) throw new Error('Usage: prune-backups <directory> [keep]');
  const keep = keepValue === undefined ? 14 : Number.parseInt(keepValue, 10);
  if (!Number.isInteger(keep) || keep < 1) throw new Error('keep must be a positive integer');
  console.log(JSON.stringify(await pruneBackups(directory, keep)));
}
