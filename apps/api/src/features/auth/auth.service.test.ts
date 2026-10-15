import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { createTestDatabase } from '../../db/testDatabase.js';
import { AuthRepository } from './auth.repository.js';
import { SessionService } from './auth.service.js';
import { ScryptPasswordHasher } from './password.js';

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('uses an independent salt for each password hash', async () => {
    const first = await hasher.hash('correct horse battery staple');
    const second = await hasher.hash('correct horse battery staple');

    expect(first).not.toBe(second);
  });

  it('accepts the correct password and rejects an incorrect password', async () => {
    const encoded = await hasher.hash('正确密码');

    await expect(hasher.verify('正确密码', encoded)).resolves.toBe(true);
    await expect(hasher.verify('错误密码', encoded)).resolves.toBe(false);
  });
});

describe('SessionService', () => {
  let database: AppDatabase;
  let repository: AuthRepository;
  let now: Date;

  beforeEach(() => {
    database = createTestDatabase();
    migrateDatabase(database);
    database.sqlite
      .prepare(
        `INSERT INTO users (id, username, password_hash, created_at, updated_at)
         VALUES ('7d831d11-27b9-42f3-bce7-005d4ed3c005', 'admin', 'hash', 1, 1)`,
      )
      .run();
    repository = new AuthRepository(database);
    now = new Date('2026-10-15T02:00:00.000Z');
  });

  afterEach(() => database.close());

  it('stores only hashes of the raw session and CSRF tokens', async () => {
    const service = createService(repository, () => now);
    const session = await service.create('7d831d11-27b9-42f3-bce7-005d4ed3c005');

    const stored = database.sqlite
      .prepare('SELECT token_hash, csrf_token_hash FROM sessions WHERE id = ?')
      .get(session.sessionId) as { token_hash: string; csrf_token_hash: string };

    expect(stored.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.csrf_token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.token_hash).not.toContain(session.rawToken);
    expect(stored.csrf_token_hash).not.toContain(session.csrfToken);
  });

  it('rejects expired and revoked sessions', async () => {
    const service = createService(repository, () => now);
    const expired = await service.create('7d831d11-27b9-42f3-bce7-005d4ed3c005', -1);
    const revoked = await service.create('7d831d11-27b9-42f3-bce7-005d4ed3c005');
    await service.revoke(revoked.rawToken);

    await expect(service.authenticate(expired.rawToken)).resolves.toBeNull();
    await expect(service.authenticate(revoked.rawToken)).resolves.toBeNull();
  });

  it('uses the injected constant-time comparator for token hashes', async () => {
    const compareHashes = vi.fn(() => true);
    const service = createService(repository, () => now, compareHashes);
    const session = await service.create('7d831d11-27b9-42f3-bce7-005d4ed3c005');

    await expect(service.authenticate(session.rawToken)).resolves.toMatchObject({
      username: 'admin',
    });
    expect(compareHashes).toHaveBeenCalledOnce();
    expect(compareHashes).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });
});

function createService(
  repository: AuthRepository,
  now: () => Date,
  compareHashes?: (left: string, right: string) => boolean,
): SessionService {
  return new SessionService(repository, { now }, 30 * 24 * 60 * 60 * 1_000, compareHashes);
}
