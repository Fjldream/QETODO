import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { AppDatabase } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { HttpError } from '../../lib/httpErrors.js';
import { requireAuth, requireProtectedMutation } from '../auth/auth.guard.js';
import type { SessionService } from '../auth/auth.service.js';
import { AttachmentRepository } from './attachment.repository.js';
import { AttachmentService } from './attachment.service.js';
import { AttachmentStorage } from './attachment.storage.js';

interface AttachmentRouteDependencies {
  appOrigin: string;
  clock: Clock;
  database: AppDatabase;
  sessions: SessionService;
  uploadDir: string;
}

export async function registerAttachmentRoutes(app: FastifyInstance, dependencies: AttachmentRouteDependencies): Promise<void> {
  await app.register(multipart, { limits: { files: 1, fileSize: 1_000_000, parts: 2 } });
  const service = new AttachmentService(
    new AttachmentRepository(dependencies.database),
    new AttachmentStorage(dependencies.uploadDir),
    dependencies.clock,
  );

  app.get('/api/tasks/:id/attachments', async (request) => {
    const authenticated = await requireAuth(request, dependencies.sessions);
    return service.list(authenticated.user.userId, taskId(request));
  });

  app.post('/api/tasks/:id/attachments', async (request, reply) => {
    const authenticated = await requireProtectedMutation(request, dependencies.sessions, dependencies.appOrigin);
    try {
      const part = await request.file();
      if (!part) throw new HttpError(400, 'ATTACHMENT_REQUIRED');
      const bytes = await part.toBuffer();
      if (part.file.truncated) throw new HttpError(413, 'ATTACHMENT_TOO_LARGE');
      const attachment = await service.attach(authenticated.user.userId, taskId(request), { fileName: part.filename, bytes });
      return reply.status(201).send(attachment);
    } catch (error) {
      if (isMultipartLimit(error)) throw new HttpError(413, 'ATTACHMENT_TOO_LARGE');
      throw error;
    }
  });

  app.get('/api/tasks/:id/attachments/:attachmentId/content', async (request, reply) => {
    const authenticated = await requireAuth(request, dependencies.sessions);
    const result = await service.read(authenticated.user.userId, taskId(request), attachmentId(request));
    return reply
      .header('Content-Type', result.attachment.mediaType)
      .header('Content-Length', result.bytes.length)
      .header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(result.attachment.fileName)}`)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'private, max-age=86400')
      .send(result.bytes);
  });

  app.delete('/api/tasks/:id/attachments/:attachmentId', async (request, reply) => {
    const authenticated = await requireProtectedMutation(request, dependencies.sessions, dependencies.appOrigin);
    await service.delete(authenticated.user.userId, taskId(request), attachmentId(request));
    return reply.status(204).send();
  });
}

function taskId(request: FastifyRequest): string {
  return (request.params as { id: string }).id;
}

function attachmentId(request: FastifyRequest): string {
  return (request.params as { attachmentId: string }).attachmentId;
}

function isMultipartLimit(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && String(error.code).includes('FILE_TOO_LARGE');
}
