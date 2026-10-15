import { randomUUID } from 'node:crypto';

import type { AppDatabase } from '../../db/client.js';

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export class PushRepository {
  constructor(private readonly database: AppDatabase) {}

  upsert(userId: string, subscription: Omit<PushSubscriptionRecord, 'id' | 'userId'>, now: number): void {
    this.database.sqlite.prepare(`INSERT INTO push_subscriptions
      (id, user_id, endpoint, p256dh, auth, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh,
        auth = excluded.auth, updated_at = excluded.updated_at`)
      .run(randomUUID(), userId, subscription.endpoint, subscription.p256dh, subscription.auth, now, now);
  }

  listForUser(userId: string): PushSubscriptionRecord[] {
    return this.database.sqlite.prepare(`SELECT id, user_id AS userId, endpoint, p256dh, auth
      FROM push_subscriptions WHERE user_id = ?`).all(userId) as PushSubscriptionRecord[];
  }

  usersWithSubscriptions(): string[] {
    return this.database.sqlite.prepare('SELECT DISTINCT user_id FROM push_subscriptions').pluck().all() as string[];
  }

  remove(id: string): void {
    this.database.sqlite.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(id);
  }

  removeEndpoint(userId: string, endpoint: string): void {
    this.database.sqlite.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint);
  }
}
