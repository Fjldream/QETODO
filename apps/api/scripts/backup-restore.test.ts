import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { createBackup, verifyBackup } from './backup.js';
import { restoreBackup } from './restore.js';

describe('verified backup and atomic restore', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

  it('backs up SQLite and attachments, rejects corruption, and changes live data only after verification', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qetodo-backup-test-'));
    roots.push(root);
    const databasePath = join(root, 'live.db');
    const uploadDir = join(root, 'uploads');
    const backupDir = join(root, 'backups');
    mkdirSync(uploadDir);
    const database = new Database(databasePath);
    database.exec('CREATE TABLE sample (value TEXT); INSERT INTO sample VALUES (\'original\')');
    database.close();
    writeFileSync(join(uploadDir, 'evidence.webp'), 'attachment');

    const backup = await createBackup({ databasePath, uploadDir, backupDir, now: () => new Date('2026-10-15T02:03:04Z') });
    expect(await verifyBackup(backup)).toBe(true);
    new Database(databasePath).prepare('UPDATE sample SET value = ?').run('changed');

    const snapshot = join(backup, 'database.sqlite');
    const originalSnapshot = readFileSync(snapshot);
    writeFileSync(snapshot, originalSnapshot.subarray(0, 32));
    await expect(restoreBackup(backup, { databasePath, uploadDir })).rejects.toBeTruthy();
    expect(new Database(databasePath).prepare('SELECT value FROM sample').pluck().get()).toBe('changed');

    writeFileSync(snapshot, originalSnapshot);
    await restoreBackup(backup, { databasePath, uploadDir });
    expect(new Database(databasePath).prepare('SELECT value FROM sample').pluck().get()).toBe('original');
  });

  it('restores a verified backup into an empty staging directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qetodo-empty-restore-test-'));
    roots.push(root);
    const sourceDatabase = join(root, 'source.db');
    const sourceUploads = join(root, 'source-uploads');
    const backupDir = join(root, 'backups');
    mkdirSync(sourceUploads);
    const database = new Database(sourceDatabase);
    database.exec('CREATE TABLE sample (value TEXT); INSERT INTO sample VALUES (\'restored\')');
    database.close();
    writeFileSync(join(sourceUploads, 'evidence.webp'), 'attachment');
    const backup = await createBackup({ databasePath: sourceDatabase, uploadDir: sourceUploads, backupDir });

    const targetDatabase = join(root, 'empty-target', 'qetodo.sqlite');
    const targetUploads = join(root, 'empty-target', 'uploads');
    await restoreBackup(backup, { databasePath: targetDatabase, uploadDir: targetUploads });

    expect(new Database(targetDatabase).prepare('SELECT value FROM sample').pluck().get()).toBe('restored');
    expect(readFileSync(join(targetUploads, 'evidence.webp'), 'utf8')).toBe('attachment');
  });
});
