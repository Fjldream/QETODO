import type { FastifyRequest } from 'fastify';

import { HttpError } from '../../lib/httpErrors.js';
import type { AuthenticatedUser, SessionService } from './auth.service.js';

export const sessionCookieName = 'qetodo_session';

export interface AuthenticatedRequest {
  rawToken: string;
  user: AuthenticatedUser;
}

export async function requireAuth(
  request: FastifyRequest,
  sessions: SessionService,
): Promise<AuthenticatedRequest> {
  const rawToken = request.cookies[sessionCookieName];
  if (!rawToken) {
    throw new HttpError(401, 'AUTHENTICATION_REQUIRED');
  }

  const user = await sessions.authenticate(rawToken);
  if (!user) {
    throw new HttpError(401, 'AUTHENTICATION_REQUIRED');
  }

  return { rawToken, user };
}

export async function requireProtectedMutation(
  request: FastifyRequest,
  sessions: SessionService,
  appOrigin: string,
): Promise<AuthenticatedRequest> {
  const authenticated = await requireAuth(request, sessions);
  const csrfToken = request.headers['x-csrf-token'];

  if (
    request.headers.origin !== appOrigin ||
    typeof csrfToken !== 'string' ||
    !(await sessions.verifyCsrf(authenticated.user.sessionId, csrfToken))
  ) {
    throw new HttpError(403, 'REQUEST_FORBIDDEN');
  }

  return authenticated;
}
