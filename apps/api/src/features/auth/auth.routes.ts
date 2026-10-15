import { loginInputSchema } from '@qetodo/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { Clock } from '../../lib/clock.js';
import { HttpError } from '../../lib/httpErrors.js';
import { requireAuth, requireProtectedMutation, sessionCookieName } from './auth.guard.js';
import type { AuthRepository } from './auth.repository.js';
import type { SessionService } from './auth.service.js';
import type { PasswordHasher } from './password.js';

export interface AuthRouteDependencies {
  appOrigin: string;
  clock: Clock;
  loginRateLimit: { maxFailures: number; windowMs: number };
  passwordHasher: PasswordHasher;
  repository: AuthRepository;
  sessions: SessionService;
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(10).max(256),
});

export async function registerAuthRoutes(
  app: FastifyInstance,
  dependencies: AuthRouteDependencies,
): Promise<void> {
  const limiter = new LoginFailureLimiter(dependencies.loginRateLimit);
  const dummyHash = await dependencies.passwordHasher.hash('invalid-user-placeholder');

  app.post('/api/auth/login', async (request, reply) => {
    const input = loginInputSchema.safeParse(request.body);
    if (!input.success) {
      throw new HttpError(400, 'INVALID_REQUEST');
    }

    const key = request.ip;
    if (limiter.isBlocked(key, dependencies.clock.now().getTime())) {
      throw new HttpError(429, 'TOO_MANY_ATTEMPTS');
    }

    const user = dependencies.repository.findUserByUsername(input.data.username);
    const valid = await dependencies.passwordHasher.verify(
      input.data.password,
      user?.passwordHash ?? dummyHash,
    );

    if (!user || !valid) {
      limiter.recordFailure(key, dependencies.clock.now().getTime());
      throw new HttpError(401, 'INVALID_CREDENTIALS');
    }

    limiter.clear(key);
    const session = await dependencies.sessions.create(user.id);
    reply.setCookie(sessionCookieName, session.rawToken, {
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'strict',
      expires: session.expiresAt,
    });

    return {
      userId: user.id,
      username: user.username,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt.toISOString(),
    };
  });

  app.get('/api/auth/session', async (request) => {
    const authenticated = await requireAuth(request, dependencies.sessions);
    const csrfToken = await dependencies.sessions.rotateCsrf(authenticated.user.sessionId);

    return {
      userId: authenticated.user.userId,
      username: authenticated.user.username,
      csrfToken,
      expiresAt: authenticated.user.expiresAt.toISOString(),
    };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const authenticated = await protectedMutation(request, dependencies);
    await dependencies.sessions.revoke(authenticated.rawToken);
    reply.clearCookie(sessionCookieName, { path: '/' });
    return reply.status(204).send();
  });

  app.post('/api/auth/revoke-others', async (request, reply) => {
    const authenticated = await protectedMutation(request, dependencies);
    await dependencies.sessions.revokeOtherSessions(
      authenticated.user.userId,
      authenticated.user.sessionId,
    );
    return reply.status(204).send();
  });

  app.post('/api/auth/password', async (request, reply) => {
    const authenticated = await protectedMutation(request, dependencies);
    const input = changePasswordSchema.safeParse(request.body);
    if (!input.success) {
      throw new HttpError(400, 'INVALID_REQUEST');
    }

    const user = dependencies.repository.findUserById(authenticated.user.userId);
    if (
      !user ||
      !(await dependencies.passwordHasher.verify(input.data.currentPassword, user.passwordHash))
    ) {
      throw new HttpError(401, 'INVALID_CREDENTIALS');
    }

    const nextHash = await dependencies.passwordHasher.hash(input.data.newPassword);
    dependencies.repository.updatePassword(
      user.id,
      nextHash,
      dependencies.clock.now().getTime(),
    );
    await dependencies.sessions.revokeOtherSessions(user.id, authenticated.user.sessionId);
    return reply.status(204).send();
  });
}

async function protectedMutation(
  request: FastifyRequest,
  dependencies: AuthRouteDependencies,
) {
  return requireProtectedMutation(request, dependencies.sessions, dependencies.appOrigin);
}

class LoginFailureLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(private readonly options: { maxFailures: number; windowMs: number }) {}

  isBlocked(key: string, now: number): boolean {
    return this.currentFailures(key, now).length >= this.options.maxFailures;
  }

  recordFailure(key: string, now: number): void {
    this.failures.set(key, [...this.currentFailures(key, now), now]);
  }

  clear(key: string): void {
    this.failures.delete(key);
  }

  private currentFailures(key: string, now: number): number[] {
    const current = (this.failures.get(key) ?? []).filter(
      (timestamp) => timestamp > now - this.options.windowMs,
    );
    this.failures.set(key, current);
    return current;
  }
}
