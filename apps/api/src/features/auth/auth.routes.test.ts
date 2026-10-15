import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import type { AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { createTestDatabase } from '../../db/testDatabase.js';
import { ScryptPasswordHasher } from './password.js';

interface LoginSession {
  cookie: string;
  csrfToken: string;
}

describe('authentication routes', () => {
  let app: FastifyInstance;
  let database: AppDatabase;

  beforeEach(async () => {
    database = createTestDatabase();
    migrateDatabase(database);
    const passwordHash = await new ScryptPasswordHasher().hash('quality-pass');
    database.sqlite
      .prepare(
        `INSERT INTO users (id, username, password_hash, created_at, updated_at)
         VALUES ('7d831d11-27b9-42f3-bce7-005d4ed3c005', 'admin', ?, 1, 1)`,
      )
      .run(passwordHash);
    app = buildApp({
      database,
      appOrigin: 'https://todo.example.com',
      clock: { now: () => new Date('2026-10-15T02:00:00.000Z') },
      loginRateLimit: { maxFailures: 3, windowMs: 60_000 },
    });
  });

  afterEach(async () => {
    await app.close();
    database.close();
  });

  it('sets a secure, HTTP-only, strict same-site cookie after login', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'quality-pass' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toContain('Secure');
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(response.headers['set-cookie']).toContain('SameSite=Strict');
    expect(response.json()).toMatchObject({
      username: 'admin',
      csrfToken: expect.any(String),
    });
  });

  it('uses the same generic response for unknown users and wrong passwords', async () => {
    const unknown = await loginResponse(app, 'nobody', 'quality-pass');
    const wrong = await loginResponse(app, 'admin', 'wrong-pass');

    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json()).toEqual(wrong.json());
    expect(wrong.json()).toEqual({ error: 'INVALID_CREDENTIALS' });
  });

  it('rate limits repeated login failures', async () => {
    await loginResponse(app, 'admin', 'wrong-1');
    await loginResponse(app, 'admin', 'wrong-2');
    await loginResponse(app, 'admin', 'wrong-3');
    const limited = await loginResponse(app, 'admin', 'wrong-4');

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: 'TOO_MANY_ATTEMPTS' });
  });

  it('rejects authenticated mutations without a CSRF token or from a wrong origin', async () => {
    const session = await login(app);
    const missingCsrf = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        cookie: session.cookie,
        origin: 'https://todo.example.com',
      },
    });
    const wrongOrigin = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        cookie: session.cookie,
        origin: 'https://evil.example.com',
        'x-csrf-token': session.csrfToken,
      },
    });

    expect(missingCsrf.statusCode).toBe(403);
    expect(wrongOrigin.statusCode).toBe(403);
  });

  it('invalidates the current session on logout', async () => {
    const session = await login(app);
    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: mutationHeaders(session),
    });
    const current = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: session.cookie },
    });

    expect(logout.statusCode).toBe(204);
    expect(current.statusCode).toBe(401);
  });

  it('revokes other sessions while preserving the current session', async () => {
    const first = await login(app);
    const current = await login(app);

    const revoke = await app.inject({
      method: 'POST',
      url: '/api/auth/revoke-others',
      headers: mutationHeaders(current),
    });
    const firstAfter = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: first.cookie },
    });
    const currentAfter = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: current.cookie },
    });

    expect(revoke.statusCode).toBe(204);
    expect(firstAfter.statusCode).toBe(401);
    expect(currentAfter.statusCode).toBe(200);
  });

  it('issues a usable CSRF token when restoring an existing session', async () => {
    const session = await login(app);
    const restored = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: session.cookie },
    });
    const csrfToken = (restored.json() as { csrfToken: string }).csrfToken;
    const mutation = await app.inject({
      method: 'POST',
      url: '/api/auth/revoke-others',
      headers: mutationHeaders({ cookie: session.cookie, csrfToken }),
    });

    expect(restored.statusCode).toBe(200);
    expect(csrfToken.length).toBeGreaterThanOrEqual(32);
    expect(mutation.statusCode).toBe(204);
  });
});

async function loginResponse(app: FastifyInstance, username: string, password: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
}

async function login(app: FastifyInstance): Promise<LoginSession> {
  const response = await loginResponse(app, 'admin', 'quality-pass');
  const setCookie = response.headers['set-cookie'];
  const rawCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!rawCookie) {
    throw new Error('Login response did not set a cookie');
  }

  return {
    cookie: rawCookie.split(';', 1)[0]!,
    csrfToken: (response.json() as { csrfToken: string }).csrfToken,
  };
}

function mutationHeaders(session: LoginSession): Record<string, string> {
  return {
    cookie: session.cookie,
    origin: 'https://todo.example.com',
    'x-csrf-token': session.csrfToken,
  };
}
