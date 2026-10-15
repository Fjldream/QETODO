import type { TaskDto } from '@qetodo/contracts';

import type { AppDatabase } from '../db/client.js';

export class IdempotencyStore {
  constructor(private readonly database: AppDatabase) {}

  find(operationId: string, userId: string): TaskDto | null {
    const row = this.database.sqlite
      .prepare(
        `SELECT response_body AS responseBody
         FROM idempotency_keys WHERE operation_id = ? AND user_id = ?`,
      )
      .get(operationId, userId) as { responseBody: string } | undefined;
    return row ? (JSON.parse(row.responseBody) as TaskDto) : null;
  }

  record(
    operationId: string,
    userId: string,
    operationType: string,
    responseStatus: number,
    response: TaskDto,
    createdAt: number,
  ): void {
    this.database.sqlite
      .prepare(
        `INSERT INTO idempotency_keys
         (operation_id, user_id, operation_type, response_status, response_body, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        operationId,
        userId,
        operationType,
        responseStatus,
        JSON.stringify(response),
        createdAt,
      );
  }
}
