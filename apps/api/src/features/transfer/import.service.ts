import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { exportBundleSchema, type ExportBundle, type TaskDto } from '@qetodo/contracts';

import type { AppDatabase } from '../../db/client.js';

export class ImportService {
  constructor(private readonly database: AppDatabase, private readonly uploadDir: string) {}

  validate(value: unknown): ExportBundle {
    const bundle = exportBundleSchema.parse(value);
    const files = new Map(bundle.attachmentFiles.map((file) => [file.attachmentId, file]));
    for (const task of bundle.tasks) {
      for (const attachment of task.attachments) {
        const file = files.get(attachment.id);
        if (!file || file.taskId !== task.id) throw new Error(`缺少附件: ${attachment.fileName}`);
        const bytes = Buffer.from(file.dataBase64, 'base64');
        const checksum = createHash('sha256').update(bytes).digest('hex');
        if (checksum !== file.checksum || bytes.length !== attachment.byteSize) throw new Error(`附件校验失败: ${attachment.fileName}`);
      }
    }
    return bundle;
  }

  async apply(userId: string, value: unknown): Promise<{ tasks: number; attachments: number }> {
    const bundle = this.validate(value);
    const staged = join(this.uploadDir, `.import-${randomUUID()}`);
    await mkdir(staged, { recursive: true, mode: 0o700 });
    const storageNames = new Map<string, string>();
    try {
      for (const file of bundle.attachmentFiles) {
        const attachment = bundle.tasks.flatMap(({ attachments }) => attachments).find(({ id }) => id === file.attachmentId)!;
        const name = `${randomUUID()}${extensionFor(attachment.mediaType)}`;
        await writeFile(join(staged, name), Buffer.from(file.dataBase64, 'base64'), { mode: 0o600 });
        storageNames.set(file.attachmentId, name);
      }
      const oldFiles = this.database.sqlite.prepare(`SELECT a.storage_name FROM attachments a JOIN tasks t ON t.id = a.task_id WHERE t.user_id = ?`).pluck().all(userId) as string[];
      this.database.sqlite.transaction(() => {
        this.database.sqlite.prepare('DELETE FROM tasks WHERE user_id = ?').run(userId);
        for (const task of bundle.tasks) this.insertTask(userId, task, storageNames, bundle);
      })();
      await mkdir(this.uploadDir, { recursive: true, mode: 0o700 });
      for (const name of storageNames.values()) await rename(join(staged, name), join(this.uploadDir, name));
      await Promise.all(oldFiles.map((name) => rm(join(this.uploadDir, name), { force: true })));
      return { tasks: bundle.tasks.length, attachments: bundle.attachmentFiles.length };
    } finally {
      await rm(staged, { recursive: true, force: true });
    }
  }

  private insertTask(userId: string, task: TaskDto, storageNames: Map<string, string>, bundle: ExportBundle): void {
    const recurrenceInterval = task.recurrence.kind === 'none' ? 1 : task.recurrence.interval;
    this.database.sqlite.prepare(`INSERT INTO tasks
      (id,user_id,title,description,status,priority,due_at,planned_date,waiting_on,follow_up_at,reference,recurrence_kind,recurrence_interval,
       recurrence_series_id,completion_note,created_at,updated_at,completed_at,cancelled_at,deleted_at,version)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      task.id, userId, task.title, task.description, task.status, task.priority, millis(task.dueAt), task.plannedDate, task.waitingOn,
      millis(task.followUpAt), task.reference, task.recurrence.kind, recurrenceInterval, task.recurrenceSeriesId ?? null,
      task.completionNote ?? null, millis(task.createdAt), millis(task.updatedAt), millis(task.completedAt), millis(task.cancelledAt), millis(task.deletedAt), task.version,
    );
    for (const reminder of task.reminderTimes) this.database.sqlite.prepare('INSERT INTO reminders (id,task_id,remind_at,sent_at,created_at) VALUES (?,?,?,NULL,?)').run(randomUUID(), task.id, millis(reminder), millis(task.createdAt));
    for (const tag of task.tags) {
      this.database.sqlite.prepare('INSERT OR IGNORE INTO tags (id,user_id,name,color,created_at) VALUES (?,?,?,?,?)').run(tag.id, userId, tag.name, tag.color, millis(task.createdAt));
      const tagId = this.database.sqlite.prepare('SELECT id FROM tags WHERE user_id = ? AND name = ? COLLATE NOCASE').pluck().get(userId, tag.name) as string;
      this.database.sqlite.prepare('INSERT INTO task_tags (task_id,tag_id) VALUES (?,?)').run(task.id, tagId);
    }
    for (const subtask of task.subtasks) this.database.sqlite.prepare('INSERT INTO subtasks (id,task_id,title,completed,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(subtask.id, task.id, subtask.title, Number(subtask.completed), subtask.sortOrder, millis(task.createdAt), millis(task.updatedAt));
    for (const activity of task.activities) this.database.sqlite.prepare('INSERT INTO activities (id,task_id,kind,message,metadata,created_at) VALUES (?,?,?,?,?,?)').run(activity.id, task.id, activity.kind, activity.message, activity.metadata ? JSON.stringify(activity.metadata) : null, millis(activity.createdAt));
    for (const attachment of task.attachments) {
      const file = bundle.attachmentFiles.find(({ attachmentId }) => attachmentId === attachment.id)!;
      this.database.sqlite.prepare(`INSERT INTO attachments (id,task_id,storage_name,original_name,media_type,byte_size,width,height,checksum,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(attachment.id, task.id, storageNames.get(attachment.id), attachment.fileName, attachment.mediaType, attachment.byteSize, attachment.width, attachment.height, file.checksum, millis(attachment.createdAt));
    }
  }
}

function millis(value: string | null): number | null {
  return value === null ? null : new Date(value).getTime();
}

function extensionFor(mediaType: string): string {
  return mediaType === 'image/webp' ? '.webp' : mediaType === 'image/png' ? '.png' : '.jpg';
}
