import { cp, mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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
  await cp(join(backupPath, 'database.sqlite'), stagedDatabase);
  await cp(join(backupPath, 'attachments'), stagedUploads, { recursive: true, force: true }).catch(async () => mkdir(stagedUploads, { recursive: true }));
  let databaseMoved = false;
  let uploadsMoved = false;
  try {
    await rename(config.databasePath, previousDatabase);
    databaseMoved = true;
    await rename(stagedDatabase, config.databasePath);
    await rename(config.uploadDir, previousUploads).then(() => { uploadsMoved = true; }).catch(() => undefined);
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
