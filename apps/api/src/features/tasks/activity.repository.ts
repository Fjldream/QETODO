import { randomUUID } from 'node:crypto';

import type { AppDatabase } from '../../db/client.js';

export class ActivityRepository {
  constructor(private readonly database: AppDatabase) {}

  append(
    taskId: string,
    kind: string,
    createdAt: number,
    metadata?: object,
    message?: string,
  ): void {
    this.database.sqlite
      .prepare(
        `INSERT INTO activities (id, task_id, kind, message, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        taskId,
        kind,
        message ?? null,
        metadata ? JSON.stringify(metadata) : null,
        createdAt,
      );
  }
}
