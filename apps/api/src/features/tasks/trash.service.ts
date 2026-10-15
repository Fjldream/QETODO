import type { TaskDto } from '@qetodo/contracts';

import type { AppDatabase } from '../../db/client.js';
import { TaskRepository } from './task.repository.js';

const defaultRetentionMs = 30 * 24 * 60 * 60 * 1_000;

export class TrashService {
  private readonly tasks: TaskRepository;

  constructor(
    private readonly database: AppDatabase,
    private readonly userId: string,
  ) {
    this.tasks = new TaskRepository(database, userId);
  }

  list(): TaskDto[] {
    return this.tasks.listDeleted();
  }

  purgeExpired(now: Date, retentionMs = defaultRetentionMs): number {
    const result = this.database.sqlite
      .prepare(
        `DELETE FROM tasks
         WHERE user_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?`,
      )
      .run(this.userId, now.getTime() - retentionMs);
    return result.changes;
  }
}
