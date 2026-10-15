import type { AppDatabase } from '../../db/client.js';

export interface NotificationEvent {
  key: string;
  userId: string;
  taskId: string;
  kind: 'reminder' | 'waiting-follow-up' | 'overdue-digest';
  body: string;
  reminderId?: string | undefined;
}

export class ReminderRepository {
  constructor(private readonly database: AppDatabase) {}

  due(now: number): NotificationEvent[] {
    const reminders = this.database.sqlite.prepare(`SELECT r.id, r.task_id AS taskId, t.user_id AS userId, t.title
      FROM reminders r JOIN tasks t ON t.id = r.task_id
      WHERE r.sent_at IS NULL AND r.remind_at <= ? AND t.deleted_at IS NULL
        AND t.status NOT IN ('completed', 'cancelled')`).all(now) as Array<{ id: string; taskId: string; userId: string; title: string }>;
    const waiting = this.database.sqlite.prepare(`SELECT id AS taskId, user_id AS userId, title, follow_up_at AS followUpAt
      FROM tasks WHERE status = 'waiting' AND follow_up_at <= ? AND deleted_at IS NULL`).all(now) as Array<{ taskId: string; userId: string; title: string; followUpAt: number }>;
    return [
      ...reminders.map((row) => ({ key: `reminder:${row.id}`, userId: row.userId, taskId: row.taskId, kind: 'reminder' as const, body: row.title, reminderId: row.id })),
      ...waiting.map((row) => ({ key: `waiting:${row.taskId}:${row.followUpAt}`, userId: row.userId, taskId: row.taskId, kind: 'waiting-follow-up' as const, body: row.title })),
    ];
  }

  overdueDigest(userId: string, now: number, dateKey: string): NotificationEvent | null {
    const titles = this.database.sqlite.prepare(`SELECT title FROM tasks
      WHERE user_id = ? AND due_at < ? AND deleted_at IS NULL
        AND status NOT IN ('completed', 'cancelled') ORDER BY due_at LIMIT 5`).pluck().all(userId, now) as string[];
    return titles.length ? { key: `digest:${dateKey}`, userId, taskId: '', kind: 'overdue-digest', body: `逾期：${titles.join('、')}` } : null;
  }

  digestTime(userId: string): string {
    return (this.database.sqlite.prepare('SELECT digest_time FROM notification_preferences WHERE user_id = ?').pluck().get(userId) as string | undefined) ?? '09:00';
  }

  setPreferences(userId: string, digestTime: string, advanceMinutes: number, now: number): void {
    this.database.sqlite.prepare(`INSERT INTO notification_preferences (user_id, digest_time, default_advance_minutes, updated_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET digest_time = excluded.digest_time,
      default_advance_minutes = excluded.default_advance_minutes, updated_at = excluded.updated_at`)
      .run(userId, digestTime, advanceMinutes, now);
  }

  hasSuccessfulDelivery(key: string, subscriptionId: string): boolean {
    return Boolean(this.database.sqlite.prepare(`SELECT 1 FROM notification_deliveries
      WHERE dedupe_key = ? AND subscription_id = ? AND status = 'sent'`).get(key, subscriptionId));
  }

  recordDelivery(key: string, subscriptionId: string, status: 'sent' | 'failed', now: number, error: string | null): void {
    this.database.sqlite.prepare(`INSERT INTO notification_deliveries
      (dedupe_key, subscription_id, status, attempt_count, last_error, updated_at)
      VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(dedupe_key, subscription_id) DO UPDATE SET
      status = excluded.status, attempt_count = attempt_count + 1, last_error = excluded.last_error, updated_at = excluded.updated_at`)
      .run(key, subscriptionId, status, error, now);
  }

  markReminderSent(id: string, now: number): void {
    this.database.sqlite.prepare('UPDATE reminders SET sent_at = ? WHERE id = ?').run(now, id);
  }
}
