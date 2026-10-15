import type { LocalDatabase } from '../db/localDb.js';

export type OutboxOperationKind = 'create' | 'update' | 'transition' | 'delete' | 'restore' | 'attachment';

export interface OutboxOperation {
  sequence?: number | undefined;
  operationId: string;
  taskId: string;
  kind: OutboxOperationKind;
  baseVersion: number | null;
  data: unknown;
  createdAt: string;
  retryCount: number;
  lastError: string | null;
}

export class OutboxRepository {
  constructor(private readonly db: LocalDatabase) {}

  async enqueue(operation: OutboxOperation): Promise<void> {
    await this.db.transaction('rw', this.db.outbox, async () => {
      if (await this.db.outbox.where('operationId').equals(operation.operationId).first()) return;
      await this.db.outbox.add(operation);
    });
  }

  async peek(limit = 50): Promise<OutboxOperation[]> {
    return this.db.outbox.orderBy('sequence').limit(limit).toArray();
  }

  async ack(operationId: string): Promise<void> {
    await this.db.outbox.where('operationId').equals(operationId).delete();
  }

  async fail(operationId: string, error: string): Promise<void> {
    await this.db.outbox.where('operationId').equals(operationId).modify((row) => {
      row.retryCount += 1;
      row.lastError = error;
    });
  }

  async count(): Promise<number> {
    return this.db.outbox.count();
  }
}
