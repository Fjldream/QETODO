import { cp, mkdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { verifyBackup } from './backup.js';

export async function restoreBackup(backupPath: string, config: { databasePath: string; uploadDir: string }): Promise<void> {
  if (!(await verifyBackup(backupPath))) throw new Error('备份无效，已取消恢复');
  const nonce = randomUUID();
  const stagedDatabase = `${config.databasePath}.restore-${nonce}`;
  const stagedUploads = `${config.uploadDir}.restore-${nonce}`;
  const previousDatabase = `${config.databasePath}.before-${nonce}`;
  const previousUploads = `${config.uploadDir}.before-${nonce}`;
  await mkdir(dirname(config.databasePath), { recursive: true });
  await mkdir(dirname(config.uploadDir), { recursive: true });
  await cp(join(backupPath, 'database.sqlite'), stagedDatabase);
  await cp(join(backupPath, 'attachments'), stagedUploads, { recursive: true, force: true }).catch(async () => mkdir(stagedUploads, { recursive: true }));
  let databaseMoved = false;
  let uploadsMoved = false;
  try {
    if (await pathExists(config.databasePath)) {
      await rename(config.databasePath, previousDatabase);
      databaseMoved = true;
    }
    await rename(stagedDatabase, config.databasePath);
    if (await pathExists(config.uploadDir)) {
      await rename(config.uploadDir, previousUploads);
      uploadsMoved = true;
    }
    await rename(stagedUploads, config.uploadDir);
    await rm(previousDatabase, { force: true });
    await rm(previousUploads, { recursive: true, force: true });
  } catch (error) {
    await rm(config.databasePath, { force: true });
    if (databaseMoved) await rename(previousDatabase, config.databasePath);
    await rm(config.uploadDir, { recursive: true, force: true });
    if (uploadsMoved) await rename(previousUploads, config.uploadDir);
    throw error;
  } finally {
    await rm(stagedDatabase, { force: true });
    await rm(stagedUploads, { recursive: true, force: true });
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

if (process.argv[1] && basename(process.argv[1]).startsWith('restore')) {
  const [backupPath, databasePath, uploadDir] = process.argv.slice(2);
  if (!backupPath || !databasePath || !uploadDir) {
    throw new Error('Usage: restore <backup-path> <database-path> <upload-dir>');
  }
  await restoreBackup(backupPath, { databasePath, uploadDir });
  console.log(`Backup restored: ${backupPath}`);
}
