import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

import Database from 'better-sqlite3';

export interface BackupConfig {
  databasePath: string;
  uploadDir: string;
  backupDir: string;
  now?: () => Date;
}

interface Manifest { schemaVersion: 1; createdAt: string; files: Array<{ path: string; bytes: number; sha256: string }> }

export async function createBackup(config: BackupConfig): Promise<string> {
  const now = (config.now ?? (() => new Date()))();
  const name = now.toISOString().replace(/[:.]/g, '-');
  const temporary = join(config.backupDir, `.${name}.tmp`);
  const destination = join(config.backupDir, name);
  await mkdir(temporary, { recursive: true, mode: 0o700 });
  try {
    const source = new Database(config.databasePath, { readonly: true });
    try { await source.backup(join(temporary, 'database.sqlite')); } finally { source.close(); }
    if (await exists(config.uploadDir)) await cp(config.uploadDir, join(temporary, 'attachments'), { recursive: true });
    const files = await fileManifest(temporary);
    const manifest: Manifest = { schemaVersion: 1, createdAt: now.toISOString(), files };
    await writeFile(join(temporary, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    if (!(await verifyBackup(temporary))) throw new Error('备份验证失败');
    await mkdir(config.backupDir, { recursive: true, mode: 0o700 });
    await rename(temporary, destination);
    return destination;
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyBackup(path: string): Promise<boolean> {
  try {
    const manifest = JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8')) as Manifest;
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) return false;
    for (const file of manifest.files) {
      if (!file.path || file.path.includes('..') || file.path.startsWith('/')) return false;
      const bytes = await readFile(join(path, file.path));
      if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) return false;
    }
    const database = new Database(join(path, 'database.sqlite'), { readonly: true, fileMustExist: true });
    try { return database.pragma('integrity_check', { simple: true }) === 'ok'; } finally { database.close(); }
  } catch {
    return false;
  }
}

async function fileManifest(root: string): Promise<Manifest['files']> {
  const result: Manifest['files'] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else {
        const bytes = await readFile(path);
        result.push({ path: relative(root, path), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      }
    }
  };
  await walk(root);
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

async function exists(path: string): Promise<boolean> {
  try { return (await stat(path)).isDirectory(); } catch { return false; }
}

if (process.argv[1] && basename(process.argv[1]).startsWith('backup')) {
  const [databasePath, uploadDir, backupDir] = process.argv.slice(2);
  if (!databasePath || !uploadDir || !backupDir) throw new Error('Usage: backup <database> <uploads> <backups>');
  console.log(await createBackup({ databasePath, uploadDir, backupDir }));
}
