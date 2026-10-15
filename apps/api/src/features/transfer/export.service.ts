import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { exportBundleSchema, type ExportBundle, type TaskDto } from '@qetodo/contracts';

import type { AppDatabase } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { TaskRepository } from '../tasks/task.repository.js';

export class ExportService {
  constructor(private readonly database: AppDatabase, private readonly clock: Clock) {}

  toCsv(userId: string): string {
    const header = ['标题', '状态', '截止时间', '标签', '等待对象', '下次跟进', '关联编号'];
    const rows = this.tasks(userId).map((task) => [
      task.title,
      statusLabel(task.status),
      task.dueAt ?? '',
      task.tags.map(({ name }) => name).join('、'),
      task.waitingOn ?? '',
      task.followUpAt ?? '',
      task.reference ?? '',
    ]);
    return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
  }

  async toJson(userId: string, uploadDir: string): Promise<ExportBundle> {
    const tasks = this.tasks(userId);
    const attachmentFiles: ExportBundle['attachmentFiles'] = [];
    const rows = this.database.sqlite.prepare(`SELECT a.id AS attachmentId, a.task_id AS taskId, a.storage_name AS storageName, a.checksum
      FROM attachments a JOIN tasks t ON t.id = a.task_id WHERE t.user_id = ?`).all(userId) as Array<{ attachmentId: string; taskId: string; storageName: string; checksum: string }>;
    for (const row of rows) {
      const bytes = await readFile(join(uploadDir, row.storageName));
      const checksum = createHash('sha256').update(bytes).digest('hex');
      if (checksum !== row.checksum) throw new Error(`附件校验失败: ${row.attachmentId}`);
      attachmentFiles.push({ attachmentId: row.attachmentId, taskId: row.taskId, checksum, dataBase64: bytes.toString('base64') });
    }
    return exportBundleSchema.parse({ schemaVersion: 1, exportedAt: this.clock.now().toISOString(), tasks, attachmentFiles });
  }

  private tasks(userId: string): TaskDto[] {
    const repository = new TaskRepository(this.database, userId);
    const ids = this.database.sqlite.prepare('SELECT id FROM tasks WHERE user_id = ? ORDER BY created_at').pluck().all(userId) as string[];
    return ids.map((id) => repository.find(id)).filter((task): task is TaskDto => task !== null);
  }
}

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function statusLabel(status: TaskDto['status']): string {
  return { pending: '待处理', in_progress: '进行中', waiting: '等待他人', completed: '已完成', cancelled: '已取消' }[status];
}
