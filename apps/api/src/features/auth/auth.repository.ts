import type { AppDatabase } from '../../db/client.js';

export interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
}

export interface StoredSession {
  id: string;
  userId: string;
  tokenHash: string;
  csrfTokenHash: string;
  expiresAt: number;
  revokedAt: number | null;
}

export interface NewSession {
  id: string;
  userId: string;
  tokenHash: string;
  csrfTokenHash: string;
  createdAt: number;
  expiresAt: number;
}

export class AuthRepository {
  constructor(private readonly database: AppDatabase) {}

  findUserByUsername(username: string): StoredUser | null {
    const row = this.database.sqlite
      .prepare(
        `SELECT id, username, password_hash AS passwordHash
         FROM users WHERE username = ?`,
      )
      .get(username) as StoredUser | undefined;
    return row ?? null;
  }

  findUserById(id: string): StoredUser | null {
    const row = this.database.sqlite
      .prepare(
        `SELECT id, username, password_hash AS passwordHash
         FROM users WHERE id = ?`,
      )
      .get(id) as StoredUser | undefined;
    return row ?? null;
  }

  updatePassword(userId: string, passwordHash: string, updatedAt: number): void {
    this.database.sqlite
      .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(passwordHash, updatedAt, userId);
  }

  createSession(session: NewSession): void {
    this.database.sqlite
      .prepare(
        `INSERT INTO sessions
         (id, user_id, token_hash, csrf_token_hash, created_at, expires_at)
         VALUES (@id, @userId, @tokenHash, @csrfTokenHash, @createdAt, @expiresAt)`,
      )
      .run(session);
  }

  findSessionById(id: string): StoredSession | null {
    const row = this.database.sqlite
      .prepare(
        `SELECT id, user_id AS userId, token_hash AS tokenHash,
                csrf_token_hash AS csrfTokenHash, expires_at AS expiresAt,
                revoked_at AS revokedAt
         FROM sessions WHERE id = ?`,
      )
      .get(id) as StoredSession | undefined;
    return row ?? null;
  }

  revokeSession(id: string, revokedAt: number): void {
    this.database.sqlite
      .prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
      .run(revokedAt, id);
  }

  updateCsrfTokenHash(id: string, csrfTokenHash: string): void {
    this.database.sqlite
      .prepare('UPDATE sessions SET csrf_token_hash = ? WHERE id = ?')
      .run(csrfTokenHash, id);
  }

  revokeOtherSessions(userId: string, currentId: string, revokedAt: number): void {
    this.database.sqlite
      .prepare(
        `UPDATE sessions SET revoked_at = ?
         WHERE user_id = ? AND id <> ? AND revoked_at IS NULL`,
      )
      .run(revokedAt, userId, currentId);
  }
}
