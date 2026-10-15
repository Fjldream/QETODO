import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';

import type { AppDatabase } from './db/client.js';
import { registerAuthRoutes } from './features/auth/auth.routes.js';
import { AuthRepository } from './features/auth/auth.repository.js';
import { SessionService } from './features/auth/auth.service.js';
import { ScryptPasswordHasher } from './features/auth/password.js';
import { type Clock, systemClock } from './lib/clock.js';
import { HttpError } from './lib/httpErrors.js';

export interface AppDependencies {
  database: AppDatabase;
  appOrigin: string;
  clock?: Clock;
  sessionTtlMs?: number;
  loginRateLimit?: { maxFailures: number; windowMs: number };
}

export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: false });
  const clock = dependencies.clock ?? systemClock;
  const repository = new AuthRepository(dependencies.database);
  const passwordHasher = new ScryptPasswordHasher();
  const sessions = new SessionService(
    repository,
    clock,
    dependencies.sessionTtlMs ?? 30 * 24 * 60 * 60 * 1_000,
  );

  void app.register(cookie);
  void app.register(async (scope) =>
    registerAuthRoutes(scope, {
      appOrigin: dependencies.appOrigin,
      clock,
      loginRateLimit: dependencies.loginRateLimit ?? {
        maxFailures: 5,
        windowMs: 15 * 60 * 1_000,
      },
      passwordHasher,
      repository,
      sessions,
    }),
  );

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({ error: error.code });
    }

    app.log.error(error);
    return reply.status(500).send({ error: 'INTERNAL_SERVER_ERROR' });
  });

  return app;
}
