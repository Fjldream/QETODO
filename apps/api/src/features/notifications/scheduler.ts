import { randomUUID } from 'node:crypto';

import type { RecurrenceRule } from '@qetodo/contracts';

import type { AppDatabase } from '../../db/client.js';
import { localDateKey, localTimeKey, nextOccurrence } from './recurrence.js';
import { ReminderRepository, type NotificationEvent } from './reminder.repository.js';
import { PushRepository, type PushSubscriptionRecord } from './push.repository.js';

export interface PushPayload {
  title: string;
  body: string;
  taskId: string;
  kind: NotificationEvent['kind'];
  url: string;
}

export interface SchedulerPushSender {
  send(subscription: PushSubscriptionRecord, payload: PushPayload): Promise<{ status: 'sent' | 'gone' }>;
}

export interface SchedulerResult { sent: number; failed: number; removed: number; recurrences: number }

export class NotificationScheduler {
  private readonly reminders: ReminderRepository;
  private readonly pushes: PushRepository;

  constructor(private readonly database: AppDatabase, private readonly sender: SchedulerPushSender, private readonly timeZone: string) {
    this.reminders = new ReminderRepository(database);
    this.pushes = new PushRepository(database);
  }

  async tick(now: Date): Promise<SchedulerResult> {
    const result: SchedulerResult = { sent: 0, failed: 0, removed: 0, recurrences: this.createRecurrences() };
    const events = this.reminders.due(now.getTime());
    const time = localTimeKey(now, this.timeZone);
    for (const userId of this.pushes.usersWithSubscriptions()) {
      if (time === this.reminders.digestTime(userId)) {
        const digest = this.reminders.overdueDigest(userId, now.getTime(), localDateKey(now, this.timeZone));
        if (digest) events.push(digest);
      }
    }
    for (const event of events) await this.deliver(event, now.getTime(), result);
    return result;
  }

  private async deliver(event: NotificationEvent, now: number, result: SchedulerResult): Promise<void> {
    const subscriptions = this.pushes.listForUser(event.userId);
    let complete = subscriptions.length > 0;
    for (const subscription of subscriptions) {
      if (this.reminders.hasSuccessfulDelivery(event.key, subscription.id)) continue;
      try {
        const sent = await this.sender.send(subscription, {
          title: event.kind === 'overdue-digest' ? '质量待办逾期汇总' : '质量待办提醒',
          body: event.body,
          taskId: event.taskId,
          kind: event.kind,
          url: event.taskId ? `/tasks?task=${event.taskId}` : '/today',
        });
        if (sent.status === 'gone') {
          this.pushes.remove(subscription.id);
          result.removed += 1;
          continue;
        }
        this.reminders.recordDelivery(event.key, subscription.id, 'sent', now, null);
        result.sent += 1;
      } catch (error) {
        complete = false;
        this.reminders.recordDelivery(event.key, subscription.id, 'failed', now, error instanceof Error ? error.message : 'send failed');
        result.failed += 1;
      }
    }
    if (complete && event.reminderId) this.reminders.markReminderSent(event.reminderId, now);
  }

  private createRecurrences(): number {
    const rows = this.database.sqlite.prepare(`SELECT * FROM tasks
      WHERE status = 'completed' AND recurrence_kind <> 'none' AND due_at IS NOT NULL`).all() as Array<Record<string, unknown>>;
    let created = 0;
    for (const row of rows) {
      const rule = { kind: row.recurrence_kind as 'daily' | 'weekly' | 'monthly', interval: row.recurrence_interval as number } satisfies RecurrenceRule;
      const dueAt = nextOccurrence(rule, new Date(row.due_at as number), this.timeZone);
      const seriesId = (row.recurrence_series_id as string | null) ?? (row.id as string);
      if (!row.recurrence_series_id) this.database.sqlite.prepare('UPDATE tasks SET recurrence_series_id = ? WHERE id = ?').run(seriesId, row.id);
      const outcome = this.database.sqlite.prepare(`INSERT OR IGNORE INTO tasks
        (id, user_id, title, description, status, priority, due_at, waiting_on, follow_up_at, reference,
         recurrence_kind, recurrence_interval, recurrence_series_id, occurrence_date, created_at, updated_at, version)
        VALUES (?, ?, ?, ?, 'pending', ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, 1)`)
        .run(randomUUID(), row.user_id, row.title, row.description, row.priority, dueAt.getTime(), row.reference,
          row.recurrence_kind, row.recurrence_interval, seriesId, localDateKey(dueAt, this.timeZone), Date.now(), Date.now());
      created += outcome.changes;
    }
    return created;
  }
}
