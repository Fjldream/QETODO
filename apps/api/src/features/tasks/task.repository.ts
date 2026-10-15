import { randomUUID } from 'node:crypto';

import type { TaskDto } from '@qetodo/contracts';

import type { AppDatabase } from '../../db/client.js';
import { mapTaskRow, type TaskRelations, type TaskRow } from './task.mapper.js';

export class TaskRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly userId: string,
  ) {}

  insert(task: TaskDto): void {
    this.database.sqlite
      .prepare(
        `INSERT INTO tasks
         (id, user_id, title, description, status, priority, due_at, planned_date, waiting_on,
          follow_up_at, reference, recurrence_kind, recurrence_interval,
          recurrence_series_id, completion_note, created_at, updated_at,
          completed_at, cancelled_at, deleted_at, version)
         VALUES
         (@id, @userId, @title, @description, @status, @priority, @dueAt, @plannedDate, @waitingOn,
          @followUpAt, @reference, @recurrenceKind, @recurrenceInterval,
          @recurrenceSeriesId, @completionNote, @createdAt, @updatedAt,
          @completedAt, @cancelledAt, @deletedAt, @version)`,
      )
      .run(toTaskParameters(task, this.userId));
    this.replaceReminders(task);
  }

  save(task: TaskDto): void {
    this.database.sqlite
      .prepare(
        `UPDATE tasks SET
          title = @title, description = @description, status = @status,
          priority = @priority, due_at = @dueAt, planned_date = @plannedDate, waiting_on = @waitingOn,
          follow_up_at = @followUpAt, reference = @reference,
          recurrence_kind = @recurrenceKind, recurrence_interval = @recurrenceInterval,
          recurrence_series_id = @recurrenceSeriesId, completion_note = @completionNote,
          updated_at = @updatedAt, completed_at = @completedAt,
          cancelled_at = @cancelledAt, deleted_at = @deletedAt, version = @version
         WHERE id = @id AND user_id = @userId`,
      )
      .run(toTaskParameters(task, this.userId));
    this.replaceReminders(task);
  }

  find(id: string): TaskDto | null {
    const row = this.database.sqlite
      .prepare(`${taskSelect} WHERE id = ? AND user_id = ?`)
      .get(id, this.userId) as TaskRow | undefined;
    return row ? mapTaskRow(row, this.loadRelations(row.id)) : null;
  }

  list(): TaskDto[] {
    const rows = this.database.sqlite
      .prepare(
        `${taskSelect}
         WHERE user_id = ? AND deleted_at IS NULL
           AND status NOT IN ('completed', 'cancelled')
         ORDER BY created_at DESC`,
      )
      .all(this.userId) as TaskRow[];
    return rows.map((row) => mapTaskRow(row, this.loadRelations(row.id)));
  }

  listDeleted(): TaskDto[] {
    const rows = this.database.sqlite
      .prepare(`${taskSelect} WHERE user_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`)
      .all(this.userId) as TaskRow[];
    return rows.map((row) => mapTaskRow(row, this.loadRelations(row.id)));
  }

  replaceTags(taskId: string, names: string[], createdAt: number): void {
    this.database.sqlite.prepare('DELETE FROM task_tags WHERE task_id = ?').run(taskId);
    const insertTag = this.database.sqlite.prepare(
      `INSERT INTO tags (id, user_id, name, color, created_at)
       VALUES (?, ?, ?, NULL, ?)
       ON CONFLICT(user_id, name COLLATE NOCASE) DO NOTHING`,
    );
    const findTag = this.database.sqlite.prepare(
      'SELECT id FROM tags WHERE user_id = ? AND name = ? COLLATE NOCASE',
    );
    const attach = this.database.sqlite.prepare(
      'INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)',
    );

    for (const name of names) {
      insertTag.run(randomUUID(), this.userId, name, createdAt);
      const tag = findTag.get(this.userId, name) as { id: string };
      attach.run(taskId, tag.id);
    }

    this.database.sqlite
      .prepare(
        `UPDATE tasks SET search_tags = COALESCE((
           SELECT group_concat(tags.name, ' ')
           FROM task_tags JOIN tags ON tags.id = task_tags.tag_id
           WHERE task_tags.task_id = tasks.id
         ), '') WHERE id = ? AND user_id = ?`,
      )
      .run(taskId, this.userId);
  }

  createSubtask(taskId: string, title: string, sortOrder: number, now: number): void {
    this.database.sqlite
      .prepare(
        `INSERT INTO subtasks
         (id, task_id, title, completed, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, ?, ?)`,
      )
      .run(randomUUID(), taskId, title, sortOrder, now, now);
  }

  updateSubtask(
    taskId: string,
    subtaskId: string,
    patch: {
      title?: string | undefined;
      completed?: boolean | undefined;
      sortOrder?: number | undefined;
    },
    now: number,
  ): void {
    const current = this.database.sqlite
      .prepare(
        `SELECT title, completed, sort_order AS sortOrder
         FROM subtasks WHERE id = ? AND task_id = ?`,
      )
      .get(subtaskId, taskId) as
      | { title: string; completed: number; sortOrder: number }
      | undefined;
    if (!current) throw new Error('SUBTASK_NOT_FOUND');
    this.database.sqlite
      .prepare(
        `UPDATE subtasks SET title = ?, completed = ?, sort_order = ?, updated_at = ?
         WHERE id = ? AND task_id = ?`,
      )
      .run(
        patch.title ?? current.title,
        patch.completed === undefined ? current.completed : Number(patch.completed),
        patch.sortOrder ?? current.sortOrder,
        now,
        subtaskId,
        taskId,
      );
  }

  deleteSubtask(taskId: string, subtaskId: string): void {
    this.database.sqlite
      .prepare('DELETE FROM subtasks WHERE id = ? AND task_id = ?')
      .run(subtaskId, taskId);
  }

  reorderSubtasks(taskId: string, orderedIds: string[], now: number): void {
    const update = this.database.sqlite.prepare(
      'UPDATE subtasks SET sort_order = ?, updated_at = ? WHERE id = ? AND task_id = ?',
    );
    orderedIds.forEach((id, index) => update.run(index, now, id, taskId));
  }

  hasOpenSubtasks(taskId: string): boolean {
    return Boolean(
      this.database.sqlite
        .prepare('SELECT 1 FROM subtasks WHERE task_id = ? AND completed = 0 LIMIT 1')
        .get(taskId),
    );
  }

  private replaceReminders(task: TaskDto): void {
    this.database.sqlite.prepare('DELETE FROM reminders WHERE task_id = ?').run(task.id);
    const insert = this.database.sqlite.prepare(
      `INSERT INTO reminders (id, task_id, remind_at, created_at)
       VALUES (?, ?, ?, ?)`,
    );
    for (const reminderTime of task.reminderTimes) {
      insert.run(randomUUID(), task.id, new Date(reminderTime).getTime(), Date.now());
    }
  }

  private loadRelations(taskId: string): TaskRelations {
    const reminderRows = this.database.sqlite
      .prepare('SELECT remind_at AS remindAt FROM reminders WHERE task_id = ? ORDER BY remind_at')
      .all(taskId) as Array<{ remindAt: number }>;
    const tagRows = this.database.sqlite
      .prepare(
        `SELECT tags.id, tags.name, tags.color
         FROM task_tags JOIN tags ON tags.id = task_tags.tag_id
         WHERE task_tags.task_id = ? ORDER BY tags.name COLLATE NOCASE`,
      )
      .all(taskId) as Array<{ id: string; name: string; color: string | null }>;
    const subtasks = this.database.sqlite
      .prepare(
        `SELECT id, title, completed, sort_order AS sortOrder
         FROM subtasks WHERE task_id = ? ORDER BY sort_order`,
      )
      .all(taskId) as Array<{ id: string; title: string; completed: number; sortOrder: number }>;
    const attachments = this.database.sqlite
      .prepare(
        `SELECT id, task_id AS taskId, original_name AS fileName, media_type AS mediaType,
                byte_size AS byteSize, width, height, created_at AS createdAt
         FROM attachments WHERE task_id = ? ORDER BY created_at`,
      )
      .all(taskId) as Array<Omit<TaskDto['attachments'][number], 'createdAt'> & { createdAt: number }>;
    const activities = this.database.sqlite
      .prepare(
        `SELECT id, kind, message, metadata, created_at AS createdAt
         FROM activities WHERE task_id = ? ORDER BY created_at DESC, rowid DESC`,
      )
      .all(taskId) as Array<{
        id: string;
        kind: string;
        message: string | null;
        metadata: string | null;
        createdAt: number;
      }>;

    return {
      reminderTimes: reminderRows.map(({ remindAt }) => remindAt),
      tagIds: tagRows.map(({ id }) => id),
      tags: tagRows,
      subtasks: subtasks.map((subtask) => ({
        ...subtask,
        completed: Boolean(subtask.completed),
      })),
      attachments: attachments.map((attachment) => ({
        ...attachment,
        createdAt: new Date(attachment.createdAt).toISOString(),
      })),
      activities: activities.map((activity) => ({
        id: activity.id,
        kind: activity.kind,
        message: activity.message,
        metadata: parseMetadata(activity.metadata),
        system: activity.kind !== 'manual',
        createdAt: new Date(activity.createdAt).toISOString(),
      })),
    };
  }
}

function parseMetadata(value: string | null): Record<string, unknown> | null {
  return value === null ? null : (JSON.parse(value) as Record<string, unknown>);
}

const taskSelect = `SELECT
  id, title, description, status, priority, due_at AS dueAt, planned_date AS plannedDate,
  waiting_on AS waitingOn, follow_up_at AS followUpAt, reference,
  recurrence_kind AS recurrenceKind, recurrence_interval AS recurrenceInterval,
  recurrence_series_id AS recurrenceSeriesId, completion_note AS completionNote,
  created_at AS createdAt, updated_at AS updatedAt, completed_at AS completedAt,
  cancelled_at AS cancelledAt, deleted_at AS deletedAt, version
FROM tasks`;

function toTaskParameters(task: TaskDto, userId: string) {
  return {
    id: task.id,
    userId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt ? new Date(task.dueAt).getTime() : null,
    plannedDate: task.plannedDate ?? null,
    waitingOn: task.waitingOn,
    followUpAt: task.followUpAt ? new Date(task.followUpAt).getTime() : null,
    reference: task.reference,
    recurrenceKind: task.recurrence.kind,
    recurrenceInterval: task.recurrence.kind === 'none' ? 1 : task.recurrence.interval,
    recurrenceSeriesId: task.recurrenceSeriesId ?? null,
    completionNote: task.completionNote ?? null,
    createdAt: new Date(task.createdAt).getTime(),
    updatedAt: new Date(task.updatedAt).getTime(),
    completedAt: task.completedAt ? new Date(task.completedAt).getTime() : null,
    cancelledAt: task.cancelledAt ? new Date(task.cancelledAt).getTime() : null,
    deletedAt: task.deletedAt ? new Date(task.deletedAt).getTime() : null,
    version: task.version,
  };
}
