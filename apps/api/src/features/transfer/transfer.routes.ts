import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';

import type { AppDatabase } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { requireAuth, requireProtectedMutation } from '../auth/auth.guard.js';
import type { SessionService } from '../auth/auth.service.js';
import { ExportService } from './export.service.js';
import { ImportService } from './import.service.js';

interface TransferRouteDependencies {
  appOrigin: string;
  backupDir: string;
  clock: Clock;
  database: AppDatabase;
  sessions: SessionService;
  uploadDir: string;
}

export async function registerTransferRoutes(app: FastifyInstance, dependencies: TransferRouteDependencies): Promise<void> {
  const exports = new ExportService(dependencies.database, dependencies.clock);
  const imports = new ImportService(dependencies.database, dependencies.uploadDir);

  app.get('/api/transfer/export.csv', async (request, reply) => {
    const authenticated = await requireAuth(request, dependencies.sessions);
    return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', 'attachment; filename="qetodo.csv"').send(exports.toCsv(authenticated.user.userId));
  });
  app.get('/api/transfer/export.json', async (request, reply) => {
    const authenticated = await requireAuth(request, dependencies.sessions);
    return reply.header('Content-Disposition', 'attachment; filename="qetodo-backup.json"').send(await exports.toJson(authenticated.user.userId, dependencies.uploadDir));
  });
  app.post('/api/transfer/import', { bodyLimit: 50_000_000 }, async (request) => {
    const authenticated = await requireProtectedMutation(request, dependencies.sessions, dependencies.appOrigin);
    return imports.apply(authenticated.user.userId, request.body);
  });
  app.get('/api/transfer/backup-status', async (request) => {
    await requireAuth(request, dependencies.sessions);
    try {
      const names = (await readdir(dependencies.backupDir)).filter((name) => !name.startsWith('.')).sort().reverse();
      if (!names[0]) return { lastSuccessAt: null, lastFailureAt: null };
      const manifest = JSON.parse(await readFile(join(dependencies.backupDir, names[0], 'manifest.json'), 'utf8')) as { createdAt?: string };
      return { lastSuccessAt: manifest.createdAt ?? null, lastFailureAt: null };
    } catch {
      return { lastSuccessAt: null, lastFailureAt: null };
    }
  });
}
