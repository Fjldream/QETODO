import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppDatabase } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { HttpError } from '../../lib/httpErrors.js';
import { requireAuth, requireProtectedMutation } from '../auth/auth.guard.js';
import type { SessionService } from '../auth/auth.service.js';
import { PushRepository } from './push.repository.js';
import { ReminderRepository } from './reminder.repository.js';

interface NotificationRouteDependencies {
  appOrigin: string;
  clock: Clock;
  database: AppDatabase;
  sessions: SessionService;
  vapidPublicKey: string;
}

const subscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
const preferencesSchema = z.object({
  digestTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  defaultAdvanceMinutes: z.number().int().min(0).max(43_200).default(0),
});

export async function registerNotificationRoutes(app: FastifyInstance, dependencies: NotificationRouteDependencies): Promise<void> {
  const pushes = new PushRepository(dependencies.database);
  const reminders = new ReminderRepository(dependencies.database);

  app.get('/api/notifications/config', async (request) => {
    const authenticated = await requireAuth(request, dependencies.sessions);
    return { vapidPublicKey: dependencies.vapidPublicKey, digestTime: reminders.digestTime(authenticated.user.userId) };
  });

  app.put('/api/notifications/subscriptions', async (request, reply) => {
    const authenticated = await requireProtectedMutation(request, dependencies.sessions, dependencies.appOrigin);
    const parsed = subscriptionSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, 'INVALID_REQUEST', parsed.error.issues);
    pushes.upsert(authenticated.user.userId, { endpoint: parsed.data.endpoint, ...parsed.data.keys }, dependencies.clock.now().getTime());
    return reply.status(204).send();
  });

  app.delete('/api/notifications/subscriptions', async (request, reply) => {
    const authenticated = await requireProtectedMutation(request, dependencies.sessions, dependencies.appOrigin);
    const parsed = z.object({ endpoint: z.url() }).safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, 'INVALID_REQUEST', parsed.error.issues);
    pushes.removeEndpoint(authenticated.user.userId, parsed.data.endpoint);
    return reply.status(204).send();
  });

  app.put('/api/notifications/preferences', async (request, reply) => {
    const authenticated = await requireProtectedMutation(request, dependencies.sessions, dependencies.appOrigin);
    const parsed = preferencesSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, 'INVALID_REQUEST', parsed.error.issues);
    reminders.setPreferences(authenticated.user.userId, parsed.data.digestTime, parsed.data.defaultAdvanceMinutes, dependencies.clock.now().getTime());
    return reply.status(204).send();
  });
}
