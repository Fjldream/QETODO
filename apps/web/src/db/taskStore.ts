import type { TaskDto } from '@qetodo/contracts';

import type { OutboxOperation } from '../sync/outbox.js';
import type { LocalDatabase } from './localDb.js';

export class LocalTaskStore {
  constructor(private readonly db: LocalDatabase) {}

  async get(id: string): Promise<TaskDto | undefined> {
    return this.db.tasks.get(id);
  }

  async list(): Promise<TaskDto[]> {
    return this.db.tasks.orderBy('updatedAt').reverse().toArray();
  }

  async put(task: TaskDto): Promise<void> {
    await this.db.tasks.put(task);
  }

  async putMany(tasks: TaskDto[]): Promise<void> {
    await this.db.tasks.bulkPut(tasks);
  }

  async replaceFromAcknowledgement(localId: string, task: TaskDto): Promise<void> {
    await this.db.transaction('rw', this.db.tasks, async () => {
      if (localId !== task.id) await this.db.tasks.delete(localId);
      await this.db.tasks.put(task);
    });
  }

  async applyOptimistic(task: TaskDto, operation: OutboxOperation): Promise<void> {
    await this.db.transaction('rw', this.db.tasks, this.db.outbox, async () => {
      await this.db.tasks.put(task);
      const duplicate = await this.db.outbox.where('operationId').equals(operation.operationId).first();
      if (!duplicate) await this.db.outbox.add(operation);
    });
  }

  async deleteOptimistically(taskId: string, operation: OutboxOperation, deletedAt: string): Promise<void> {
    await this.db.transaction('rw', this.db.tasks, this.db.outbox, async () => {
      const task = await this.db.tasks.get(taskId);
      if (!task) throw new Error('Task not found in local store');
      await this.db.tasks.put({ ...task, deletedAt, updatedAt: deletedAt });
      const duplicate = await this.db.outbox.where('operationId').equals(operation.operationId).first();
      if (!duplicate) await this.db.outbox.add(operation);
    });
  }

  async clear(): Promise<void> {
    await this.db.transaction('rw', this.db.tasks, this.db.outbox, this.db.metadata, async () => {
      await Promise.all([this.db.tasks.clear(), this.db.outbox.clear(), this.db.metadata.clear()]);
    });
  }
}
