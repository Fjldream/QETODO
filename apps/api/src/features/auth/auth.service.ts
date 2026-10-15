import { randomUUID } from 'node:crypto';

import type { Clock } from '../../lib/clock.js';
import { constantTimeHashEqual, hashToken, randomToken } from '../../lib/security.js';
import type { AuthRepository } from './auth.repository.js';

export interface SessionToken {
  sessionId: string;
  rawToken: string;
  csrfToken: string;
  expiresAt: Date;
}

export interface AuthenticatedUser {
  userId: string;
  username: string;
  sessionId: string;
  expiresAt: Date;
}

type HashComparator = (left: string, right: string) => boolean;

export class SessionService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly clock: Clock,
    private readonly defaultTtlMs: number,
    private readonly compareHashes: HashComparator = constantTimeHashEqual,
  ) {}

  async create(userId: string, ttlMs = this.defaultTtlMs): Promise<SessionToken> {
    const sessionId = randomUUID();
    const secret = randomToken();
    const rawToken = `${sessionId}.${secret}`;
    const csrfToken = randomToken();
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + ttlMs);

    this.repository.createSession({
      id: sessionId,
      userId,
      tokenHash: hashToken(rawToken),
      csrfTokenHash: hashToken(csrfToken),
      createdAt: now.getTime(),
      expiresAt: expiresAt.getTime(),
    });

    return { sessionId, rawToken, csrfToken, expiresAt };
  }

  async authenticate(rawToken: string): Promise<AuthenticatedUser | null> {
    const sessionId = parseSessionId(rawToken);
    if (!sessionId) {
      return null;
    }

    const session = this.repository.findSessionById(sessionId);
    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt <= this.clock.now().getTime() ||
      !this.compareHashes(hashToken(rawToken), session.tokenHash)
    ) {
      return null;
    }

    const user = this.repository.findUserById(session.userId);
    if (!user) {
      return null;
    }

    return {
      userId: user.id,
      username: user.username,
      sessionId,
      expiresAt: new Date(session.expiresAt),
    };
  }

  async verifyCsrf(sessionId: string, csrfToken: string): Promise<boolean> {
    const session = this.repository.findSessionById(sessionId);
    return Boolean(
      session && this.compareHashes(hashToken(csrfToken), session.csrfTokenHash),
    );
  }

  async rotateCsrf(sessionId: string): Promise<string> {
    const csrfToken = randomToken();
    this.repository.updateCsrfTokenHash(sessionId, hashToken(csrfToken));
    return csrfToken;
  }

  async revoke(rawToken: string): Promise<void> {
    const sessionId = parseSessionId(rawToken);
    if (sessionId) {
      this.repository.revokeSession(sessionId, this.clock.now().getTime());
    }
  }

  async revokeOtherSessions(userId: string, currentSessionId: string): Promise<void> {
    this.repository.revokeOtherSessions(
      userId,
      currentSessionId,
      this.clock.now().getTime(),
    );
  }
}

function parseSessionId(rawToken: string): string | null {
  const separator = rawToken.indexOf('.');
  if (separator < 1) {
    return null;
  }

  return rawToken.slice(0, separator);
}
