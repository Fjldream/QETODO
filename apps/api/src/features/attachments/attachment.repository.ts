import type { AttachmentDto } from '@qetodo/contracts';

import type { AppDatabase } from '../../db/client.js';
import { HttpError } from '../../lib/httpErrors.js';

export interface AttachmentRecord extends AttachmentDto {
  storageName: string;
  checksum: string;
}

interface StoredRow extends Omit<AttachmentRecord, 'createdAt' | 'fileName'> {
  originalName: string;
  createdAt: number;
}

export class AttachmentRepository {
  constructor(private readonly database: AppDatabase) {}

  insert(userId: string, record: AttachmentRecord): AttachmentDto {
    return this.database.sqlite.transaction(() => {
      const task = this.database.sqlite.prepare('SELECT 1 FROM tasks WHERE id = ? AND user_id = ?').get(record.taskId, userId);
      if (!task) throw new HttpError(404, 'TASK_NOT_FOUND');
      const count = this.database.sqlite.prepare('SELECT count(*) FROM attachments WHERE task_id = ?').pluck().get(record.taskId) as number;
      if (count >= 6) throw new HttpError(409, 'ATTACHMENT_LIMIT_REACHED');
      this.database.sqlite.prepare(`INSERT INTO attachments
        (id, task_id, storage_name, original_name, media_type, byte_size, width, height, checksum, created_at)
        VALUES (@id, @taskId, @storageName, @fileName, @mediaType, @byteSize, @width, @height, @checksum, @createdAt)`)
        .run({ ...record, createdAt: new Date(record.createdAt).getTime() });
      return toDto(record);
    })();
  }

  list(userId: string, taskId: string): AttachmentDto[] {
    this.requireTask(userId, taskId);
    return (this.database.sqlite.prepare(`${selectAttachment} WHERE a.task_id = ? AND t.user_id = ? ORDER BY a.created_at`).all(taskId, userId) as StoredRow[]).map(toDto);
  }

  findOwned(userId: string, taskId: string, attachmentId: string): AttachmentRecord | null {
    const row = this.database.sqlite.prepare(`${selectAttachment} WHERE a.id = ? AND a.task_id = ? AND t.user_id = ?`).get(attachmentId, taskId, userId) as StoredRow | undefined;
    return row ? toRecord(row) : null;
  }

  deleteOwned(userId: string, taskId: string, attachmentId: string): AttachmentRecord | null {
    return this.database.sqlite.transaction(() => {
      const record = this.findOwned(userId, taskId, attachmentId);
      if (!record) return null;
      this.database.sqlite.prepare('DELETE FROM attachments WHERE id = ? AND task_id = ?').run(attachmentId, taskId);
      return record;
    })();
  }

  private requireTask(userId: string, taskId: string): void {
    if (!this.database.sqlite.prepare('SELECT 1 FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId)) {
      throw new HttpError(404, 'TASK_NOT_FOUND');
    }
  }
}

const selectAttachment = `SELECT
  a.id, a.task_id AS taskId, a.storage_name AS storageName,
  a.original_name AS originalName, a.media_type AS mediaType,
  a.byte_size AS byteSize, a.width, a.height, a.checksum,
  a.created_at AS createdAt
  FROM attachments a JOIN tasks t ON t.id = a.task_id`;

function toRecord(row: StoredRow): AttachmentRecord {
  return { ...row, fileName: row.originalName, createdAt: new Date(row.createdAt).toISOString() };
}

function toDto(row: AttachmentRecord | StoredRow): AttachmentDto {
  const record = 'originalName' in row ? toRecord(row) : row;
  return {
    id: record.id,
    taskId: record.taskId,
    fileName: record.fileName,
    mediaType: record.mediaType,
    byteSize: record.byteSize,
    width: record.width,
    height: record.height,
    createdAt: record.createdAt,
  };
}
